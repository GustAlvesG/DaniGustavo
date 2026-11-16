import type { Metadata } from "next";

/**
 * Páginas que não devem aparecer em buscadores (convite, busca de convite,
 * pagamento): `export const metadata = noindex({ title: "…" })`.
 * Rotas previstas: /c/*, /confirmar, /presentes/pagamento/*.
 */
export const NOINDEX: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};

export const NOINDEX_ROUTES = ["/c/", "/confirmar", "/presentes/pagamento/"] as const;

export function noindex(extra: Metadata = {}): Metadata {
  return { ...extra, robots: NOINDEX };
}

/** A rota está na lista de noindex? */
export function isNoindexPath(pathname: string): boolean {
  return NOINDEX_ROUTES.some((r) => (r.endsWith("/") ? pathname.startsWith(r) : pathname === r));
}
