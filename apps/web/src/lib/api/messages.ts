import "server-only";

import { WallResponse, type WallMessage } from "@casamento/shared";
import { apiGet } from "./client";
import { CACHE_TAGS } from "./tags";

export type Wall = { messages: WallMessage[]; available: boolean };

/**
 * Mural de recados (`GET /api/messages`, só os aprovados), cacheado por 60 s com a tag
 * "messages": aprovar ou ocultar no painel invalida a tag (a API chama /api/revalidar) e o
 * mural muda na hora. Se a API não responder, o mural some em vez de quebrar a página.
 */
export async function getWall(): Promise<Wall> {
  const result = await apiGet("/api/messages", WallResponse, { tags: [CACHE_TAGS.messages] });
  if (result.ok) return { messages: result.data.messages, available: true };
  console.warn(
    `[recados] /api/messages indisponível (${result.status} ${result.error.code}). ${result.error.message}`,
  );
  return { messages: [], available: false };
}
