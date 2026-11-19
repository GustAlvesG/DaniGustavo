import "server-only";

import { GiftsResponse } from "@casamento/shared";
import { apiGet } from "./client";
import { currentEvent, type EventInfo } from "./event";
import { CACHE_TAGS } from "./tags";

export type GiftList = GiftsResponse & { available: boolean };

/**
 * Lista de presentes do evento (`GET /api/e/<slug>/gifts`), cacheada por 30 s com a tag
 * `gifts:<id>`. As cotas restantes mudam com as compras: criar um pedido invalida a tag
 * (`updateTag`), e a API confere de novo a cota na hora de reservar. Se a API não
 * responder, a página mostra um aviso em vez de quebrar.
 */
export async function getGifts(event?: EventInfo): Promise<GiftList> {
  const ev = event ?? (await currentEvent());
  const empty = { gifts: [], categories: [], cardFeePercent: 0, requiresCpf: false };
  if (ev.id === 0) return { ...empty, available: false };
  const result = await apiGet(`/api/e/${encodeURIComponent(ev.slug)}/gifts`, GiftsResponse, {
    tags: [CACHE_TAGS.gifts(ev.id)],
    revalidate: 30,
  });
  if (result.ok) return { ...result.data, available: true };
  console.warn(
    `[presentes] /api/e/${ev.slug}/gifts indisponível (${result.status} ${result.error.code}). ${result.error.message}`,
  );
  return { ...empty, available: false };
}
