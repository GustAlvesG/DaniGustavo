import { home, type SecaoHome } from "@/content/home";

export type NavItem = { href: string; label: string };

/** Âncora de cada seção da home (o id da <section>). */
export const SECAO_ID: Record<SecaoHome, string> = {
  historia: "historia",
  album: "album",
  casamento: "casamento",
  versiculo: "versiculo",
  programacao: "programacao",
  traje: "traje",
  presentes: "presentes",
  rsvp: "rsvp",
  duvidas: "duvidas",
};

/**
 * Itens do menu: as seções da home que têm `menu` em content/home.ts, na
 * ordem da página, mais os links extras (páginas internas). Os links são
 * "/#secao" para funcionarem também fora da home, ou o `menuLink` da seção
 * (Presentes leva direto a /presentes).
 */
export function navItems(): NavItem[] {
  const secoes = home.secoes.flatMap((s) => {
    const { menu: label, menuLink } = home[s] as { menu?: string; menuLink?: string };
    return label ? [{ href: menuLink ?? `/#${SECAO_ID[s]}`, label }] : [];
  });
  return [...secoes, ...home.menu.extras.map((e) => ({ href: e.link, label: e.texto }))];
}
