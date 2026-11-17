import type { Env } from "../env.ts";

/** Tags de cache do site (iguais a apps/web/src/lib/api/tags.ts). */
export type CacheTag = "site" | "gifts" | "messages";

export type Revalidate = (tags: CacheTag[]) => Promise<void>;

/**
 * Avisa o site (Next) para descartar o cache das tags: POST SITE_URL/api/revalidar com o
 * mesmo X-Web-Key que o site usa para falar com a API (segredo já compartilhado no .env).
 * Falha não derruba a ação do painel: o cache expira sozinho em até 60 s.
 */
export function createWebRevalidator(env: Env): Revalidate {
  return async (tags) => {
    try {
      const res = await fetch(`${env.SITE_URL.replace(/\/+$/, "")}/api/revalidar`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-web-key": env.WEB_KEY },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) console.warn(`[painel] O site recusou a revalidação (${res.status}).`);
    } catch (err) {
      console.warn(
        `[painel] Não deu para avisar o site (${(err as Error).name}); o cache expira sozinho.`,
      );
    }
  };
}
