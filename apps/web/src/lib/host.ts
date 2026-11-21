/** Host do evento: helpers puros, usados pelo proxy e pelo servidor (testáveis no Vitest). */

/** Header interno com o host já normalizado (Server Actions e Route Handlers leem dele). */
export const EVENT_HOST_HEADER = "x-event-host";

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/;

/**
 * Host normalizado (minúsculo, com porta, como fica em `event_domains.host`) ou null se
 * inválido. `.invalid` é reservado (RFC 2606): o host reserva do build (`build.invalid`)
 * nunca é alcançável por fora.
 */
export function normalizeHost(raw: string | null): string | null {
  const host = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 191 || !HOST_RE.test(host)) return null;
  const name = host.replace(/:\d+$/, "");
  if (name.startsWith(".") || name.includes("..") || name.endsWith(".invalid")) return null;
  return host;
}

/**
 * Root param `host` → host (o segmento pode chegar codificado, `localhost%3A3000`). Desde a
 * Fase 6 há um segundo root layout (`app/plataforma`, sem `host`), então o tipo gerado do root
 * param admite `undefined`: vira "" (nenhum evento tem host vazio → 404).
 */
export function decodeHostParam(param: string | undefined): string {
  if (!param) return "";
  return param.includes("%") ? decodeURIComponent(param) : param;
}

/* ------------------------------------------------------------------------ */
/* X-Forwarded-Host restrito (Fase 6)                                        */
/* ------------------------------------------------------------------------ */

/** Por quanto tempo a resposta de `/api/hosts/:host` vale no proxy (cadastrado ou não). */
export const KNOWN_HOST_TTL_MS = 60_000;
/** Falha ao consultar a API (fora do ar, tempo esgotado): guarda pouco, para tentar logo. */
const KNOWN_HOST_ERROR_TTL_MS = 5_000;
const KNOWN_HOST_MAX = 500;
const KNOWN_HOST_TIMEOUT_MS = 2_000;

export interface HostVerifierOptions {
  /** URL da API (padrão: `API_URL`, lida a cada consulta). */
  apiBase?: () => string | null;
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * `host → Promise<boolean>`: true só se `GET /api/hosts/:host` responder 200 (host cadastrado
 * e verificado de um evento ativo). Cache em memória por processo, com limite de tamanho; API
 * fora do ar → false (na dúvida vale o `Host`, nunca o header que veio de fora).
 */
export function createHostVerifier(options: HostVerifierOptions = {}) {
  const apiBase =
    options.apiBase ?? (() => process.env.API_URL?.trim().replace(/\/+$/, "") || null);
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const cache = new Map<string, { ok: boolean; until: number }>();

  async function lookup(host: string): Promise<{ ok: boolean; ttl: number }> {
    const base = apiBase();
    if (!base) return { ok: false, ttl: KNOWN_HOST_ERROR_TTL_MS };
    try {
      const res = await doFetch(`${base}/api/hosts/${encodeURIComponent(host)}`, {
        signal: AbortSignal.timeout(KNOWN_HOST_TIMEOUT_MS),
      });
      void res.body?.cancel().catch(() => {});
      if (res.status === 200) return { ok: true, ttl: KNOWN_HOST_TTL_MS };
      if (res.status === 404) return { ok: false, ttl: KNOWN_HOST_TTL_MS };
      return { ok: false, ttl: KNOWN_HOST_ERROR_TTL_MS };
    } catch {
      return { ok: false, ttl: KNOWN_HOST_ERROR_TTL_MS };
    }
  }

  const verify = async (host: string): Promise<boolean> => {
    const hit = cache.get(host);
    if (hit && hit.until > now()) return hit.ok;
    const { ok, ttl } = await lookup(host);
    cache.delete(host);
    if (cache.size >= KNOWN_HOST_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(host, { ok, until: now() + ttl });
    return ok;
  };
  return Object.assign(verify, { clear: () => cache.clear() });
}

export type HostVerifier = ReturnType<typeof createHostVerifier>;

/**
 * Host público da requisição. O `X-Forwarded-Host` só vale se for o host da plataforma ou um
 * host cadastrado e verificado (`verify`); senão vale o `Host`. Ele existe por dois motivos: o
 * Caddy repassa o host original nele, e o próprio Next o manda quando segue o `redirect()` de
 * uma Server Action (busca a página nova em `localhost:<porta>` com os headers originais).
 * Aceitar qualquer valor deixaria um visitante escolher outro evento só forjando o header.
 */
export async function resolvePublicHost(
  headers: Pick<Headers, "get">,
  opts: { platformHost: string | null; verify: (host: string) => Promise<boolean> },
): Promise<string | null> {
  const direct = normalizeHost(headers.get("host"));
  const forwarded = normalizeHost(headers.get("x-forwarded-host")?.split(",")[0] ?? null);
  if (!forwarded || forwarded === direct) return direct;
  if (opts.platformHost && forwarded === opts.platformHost) return forwarded;
  return (await opts.verify(forwarded)) ? forwarded : direct;
}
