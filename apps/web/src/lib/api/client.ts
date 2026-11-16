import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { z } from "zod";
import { DEFAULT_REVALIDATE } from "./tags";
import {
  badResponse,
  readJson,
  toApiFailure,
  unavailable,
  type ApiFailure,
  type ApiResult,
} from "./result";

/*
 * Cliente da API (apps/api) — só no servidor. `import "server-only"` faz o
 * build falhar se um Client Component importar este arquivo, então API_URL e
 * WEB_KEY nunca chegam ao bundle do navegador.
 */

export type { ApiFailure, ApiResult } from "./result";

const READ_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS = 10_000;

function apiBase(): string | null {
  const url = process.env.API_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string } }).cause;
    return cause?.code ?? err.name;
  }
  return String(err);
}

/* ------------------------------------------------------------------------ */
/* Leituras                                                                  */
/* ------------------------------------------------------------------------ */

type RawRead = { ok: true; status: number; json: unknown } | ApiFailure;

/**
 * GET cacheado. Com `cacheComponents`, quem cacheia é o `"use cache"` (o
 * equivalente ao `fetch(..., { next: { revalidate, tags } })` do modelo
 * antigo): o resultado entra no HTML pré-renderizado e é refeito em segundo
 * plano depois de `revalidate` segundos (ISR). Falhas ficam em cache por
 * pouco tempo, para a página se corrigir sozinha quando a API voltar.
 */
async function cachedRead(path: string, tags: string[], revalidate: number): Promise<RawRead> {
  "use cache";
  cacheTag(...tags);

  const base = apiBase();
  let result: RawRead;
  if (!base) {
    result = unavailable("API_URL vazia");
  } else {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      const json = await readJson(res);
      result = res.ok ? { ok: true, status: res.status, json } : toApiFailure(res.status, json);
    } catch (err) {
      result = unavailable(describe(err));
    }
  }

  if (result.ok) {
    cacheLife({ stale: 300, revalidate, expire: 60 * 60 * 24 * 7 });
  } else {
    // ≥ 5 min de expire e ≥ 30 s de stale: continua cabendo no pré-render
    // (o build não exige <Suspense>), mas é refeito 15 s depois.
    cacheLife({ stale: 30, revalidate: 15, expire: 300 });
  }
  return result;
}

export type ApiGetOptions = {
  /** Tags de cache (CACHE_TAGS) para invalidar sob demanda. */
  tags: string[];
  /** Segundos até refazer em segundo plano. Padrão: 60. */
  revalidate?: number;
};

/**
 * Leitura pública cacheada, validada com o schema zod do contrato.
 *
 * @example const site = await apiGet("/api/site", SiteContent, { tags: [CACHE_TAGS.site] });
 */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  { tags, revalidate = DEFAULT_REVALIDATE }: ApiGetOptions,
): Promise<ApiResult<T>> {
  const raw = await cachedRead(path, tags, revalidate);
  if (!raw.ok) return raw;
  const parsed = schema.safeParse(raw.json);
  if (!parsed.success)
    return badResponse(raw.status, `${path}: ${parsed.error.issues[0]?.message}`);
  return { ok: true, status: raw.status, data: parsed.data };
}

/**
 * Leitura SEM cache, para dados por convidado (o convite e suas respostas).
 * Use dentro de <Suspense>: com `cacheComponents`, dado de runtime não pode
 * entrar no HTML pré-renderizado.
 */
export async function apiReadFresh<T>(path: string, schema: z.ZodType<T>): Promise<ApiResult<T>> {
  const base = apiBase();
  if (!base) return unavailable("API_URL vazia");
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
  } catch (err) {
    return unavailable(describe(err));
  }
  const json = await readJson(res);
  if (!res.ok) return toApiFailure(res.status, json);
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    return badResponse(res.status, `${path}: ${parsed.error.issues[0]?.message}`);
  return { ok: true, status: res.status, data: parsed.data };
}

/* ------------------------------------------------------------------------ */
/* Escritas                                                                  */
/* ------------------------------------------------------------------------ */

export type ApiWriteMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiWriteOptions<T> = {
  /** IP do convidado (veja `clientIpFrom`). A API usa no throttle e no log. */
  clientIp?: string | null;
  /** Schema da resposta de sucesso. Sem ele, `data` é `undefined`. */
  schema?: z.ZodType<T>;
};

/**
 * Escrita servidor-a-servidor (Server Actions): nunca cacheada, sempre com
 * `X-Web-Key` (a API recusa escritas sem ela) e `X-Client-Ip`.
 *
 * @example
 * const ip = clientIpFrom(await headers());
 * const r = await apiWrite("PUT", `/api/invitations/${token}/rsvp`, body, { clientIp: ip, schema: RsvpResponse });
 * if (!r.ok && r.error.code === ERROR_CODES.rsvpClosed) …
 */
export async function apiWrite<T = undefined>(
  method: ApiWriteMethod,
  path: string,
  body: unknown,
  { clientIp, schema }: ApiWriteOptions<T> = {},
): Promise<ApiResult<T>> {
  const base = apiBase();
  const key = process.env.WEB_KEY;
  if (!base || !key) return unavailable("API_URL ou WEB_KEY vazia");

  const headers: Record<string, string> = {
    accept: "application/json",
    "x-web-key": key,
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (clientIp) headers["x-client-ip"] = clientIp;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
  } catch (err) {
    return unavailable(describe(err));
  }

  const json = await readJson(res);
  if (!res.ok) return toApiFailure(res.status, json);
  if (!schema) return { ok: true, status: res.status, data: undefined as T };
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    return badResponse(res.status, `${path}: ${parsed.error.issues[0]?.message}`);
  return { ok: true, status: res.status, data: parsed.data };
}

/** IP do convidado a partir dos headers da requisição (`await headers()`). */
export function clientIpFrom(h: Pick<Headers, "get">): string | null {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || null;
}
