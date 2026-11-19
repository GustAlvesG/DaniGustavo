import "server-only";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { host as hostParam } from "next/root-params";
import { z } from "zod";
import { decodeHostParam, EVENT_HOST_HEADER, normalizeHost } from "@/lib/host";
import { apiGet } from "./client";
import { CACHE_TAGS } from "./tags";

/** Resposta de `GET /api/hosts/:host` (só eventos ativos). */
export const EventInfo = z.object({
  id: z.number().int().nonnegative(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  timezone: z.string(),
  startsAt: z.string().nullable(),
  primaryHost: z.string(),
});
export type EventInfo = z.infer<typeof EventInfo>;

/**
 * Host reserva do build: com a API fora do ar (CI), `generateStaticParams` devolve só ele e
 * as páginas saem com o conteúdo de reserva. O proxy recusa `.invalid`, então ninguém o
 * acessa de fora.
 */
export const BUILD_HOST = "build.invalid";
export const BUILD_EVENT: EventInfo = {
  id: 0,
  slug: "build-invalid",
  name: "Evento",
  type: "other",
  timezone: "America/Sao_Paulo",
  startsAt: null,
  primaryHost: BUILD_HOST,
};

/**
 * Host → evento, pela API. `apiGet` usa `"use cache"` com a tag `host:<host>`: o host entra
 * na chave do cache, então cada host tem a sua entrada (60 s; um 404 fica 15 s).
 */
async function lookup(host: string) {
  if (host === BUILD_HOST) return { ok: true as const, status: 200, data: BUILD_EVENT };
  return apiGet(`/api/hosts/${encodeURIComponent(host)}`, EventInfo, {
    tags: [CACHE_TAGS.host(host)],
  });
}

/** Evento do host; `notFound()` se o host não for de nenhum evento ativo. */
export async function getEvent(host: string): Promise<EventInfo> {
  const result = await lookup(host);
  if (result.ok) return result.data;
  if (result.status === 404) notFound();
  throw new Error(`Não deu para descobrir o evento de ${host}: ${result.error.message}`);
}

/**
 * Evento da página atual, em Server Components: o host vem do root param de `app/[host]`
 * (`next/root-params`, sem passar props de layout em layout).
 */
export async function currentEvent(): Promise<EventInfo> {
  return getEvent(decodeHostParam(await hostParam()));
}

/**
 * Evento da requisição em Server Actions e Route Handlers (lá não há root params): o host
 * vem do header que o proxy grava. Null se não houver evento ativo nesse host.
 */
export async function requestEvent(): Promise<EventInfo | null> {
  const host = normalizeHost((await headers()).get(EVENT_HOST_HEADER));
  if (!host) return null;
  const result = await lookup(host);
  return result.ok ? result.data : null;
}

/** Hosts primários dos eventos ativos (para `generateStaticParams`); vazio se a API cair. */
export async function listPrimaryHosts(): Promise<string[]> {
  const result = await apiGet("/api/hosts", z.object({ hosts: z.array(z.string()) }), {
    tags: ["hosts"],
  });
  return result.ok ? result.data.hosts : [];
}

/** Caminho da API de um evento: `eventPath(ev, "/orders")` → `/api/e/<slug>/orders`. */
export function eventPath(ev: Pick<EventInfo, "slug">, path: string): string {
  return `/api/e/${encodeURIComponent(ev.slug)}${path}`;
}

/** Como `currentEvent()`, mas null em vez de 404 (páginas de erro, metadados). */
export async function findCurrentEvent(): Promise<EventInfo | null> {
  const result = await lookup(decodeHostParam(await hostParam()));
  return result.ok ? result.data : null;
}
