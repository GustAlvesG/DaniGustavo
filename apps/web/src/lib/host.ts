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

/** Root param `host` → host (o segmento pode chegar codificado, `localhost%3A3000`). */
export function decodeHostParam(param: string): string {
  return param.includes("%") ? decodeURIComponent(param) : param;
}
