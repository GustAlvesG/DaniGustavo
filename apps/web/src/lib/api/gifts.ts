import "server-only";

import { GiftsResponse } from "@casamento/shared";
import { apiGet } from "./client";
import { CACHE_TAGS } from "./tags";

export type GiftList = GiftsResponse & { available: boolean };

/**
 * Lista de presentes (`GET /api/gifts`), cacheada por 30 s com a tag "gifts".
 * As cotas restantes mudam com as compras: criar um pedido invalida a tag
 * (`updateTag`), e a API confere de novo a cota na hora de reservar. Se a API
 * não responder, a página mostra um aviso em vez de quebrar.
 */
export async function getGifts(): Promise<GiftList> {
  const result = await apiGet("/api/gifts", GiftsResponse, {
    tags: [CACHE_TAGS.gifts],
    revalidate: 30,
  });
  if (result.ok) return { ...result.data, available: true };
  console.warn(
    `[presentes] /api/gifts indisponível (${result.status} ${result.error.code}). ${result.error.message}`,
  );
  return { gifts: [], categories: [], cardFeePercent: 0, available: false };
}
