import type { Env } from "../env.ts";
import type { EventResolver } from "./resolver.ts";
import type { EventCtx } from "./types.ts";

export interface EventUrlDeps {
  env: Pick<Env, "NODE_ENV" | "SITE_URL">;
  resolver: EventResolver;
}

/**
 * Origem pública do evento (links de e-mail, WhatsApp, QR): https em produção, http fora,
 * com o host primário de event_domains. Sem domínio cadastrado, cai no SITE_URL.
 */
export async function eventBaseUrl(
  event: Pick<EventCtx, "id">,
  { env, resolver }: EventUrlDeps,
): Promise<string> {
  const host = await resolver.primaryHost(event.id);
  if (!host) return env.SITE_URL.replace(/\/+$/, "");
  return `${env.NODE_ENV === "production" ? "https" : "http"}://${host}`;
}
