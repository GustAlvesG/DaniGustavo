import "server-only";

import { WallResponse, type WallMessage } from "@casamento/shared";
import { apiGet } from "./client";
import { currentEvent, type EventInfo } from "./event";
import { CACHE_TAGS } from "./tags";

export type Wall = { messages: WallMessage[]; available: boolean };

/**
 * Mural de recados do evento (`GET /api/e/<slug>/messages`, só os aprovados), cacheado por
 * 60 s com a tag `messages:<id>`: aprovar ou ocultar no painel invalida a tag (a API chama
 * /api/revalidar) e o mural muda na hora. Se a API não responder, o mural some.
 */
export async function getWall(event?: EventInfo): Promise<Wall> {
  const ev = event ?? (await currentEvent());
  if (ev.id === 0) return { messages: [], available: false };
  const result = await apiGet(`/api/e/${encodeURIComponent(ev.slug)}/messages`, WallResponse, {
    tags: [CACHE_TAGS.messages(ev.id)],
  });
  if (result.ok) return { messages: result.data.messages, available: true };
  console.warn(
    `[recados] /api/e/${ev.slug}/messages indisponível (${result.status} ${result.error.code}). ${result.error.message}`,
  );
  return { messages: [], available: false };
}
