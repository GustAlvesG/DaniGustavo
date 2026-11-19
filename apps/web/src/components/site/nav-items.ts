import type { SiteContent } from "@casamento/shared";
import type { HomeContent, SecaoHome } from "@/content/home";

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
  recados: "recados",
  rsvp: "rsvp",
  duvidas: "duvidas",
};

/**
 * Itens do menu: as seções da home que têm `menu` em content/home.ts, na
 * ordem da página, mais os links extras (páginas internas). Os links são
 * "/#secao" para funcionarem também fora da home, ou o `menuLink` da seção
 * (Presentes leva direto a /presentes).
 */
export function navItems(home: HomeContent, site: SiteContent): NavItem[] {
  const secoes = home.secoes
    .filter((s) => secaoVisivel(s, home, site))
    .flatMap((s) => {
      const { menu: label, menuLink } = home[s] as { menu?: string; menuLink?: string };
      return label ? [{ href: menuLink ?? `/#${SECAO_ID[s]}`, label }] : [];
    });
  return [...secoes, ...home.menu.extras.map((e) => ({ href: e.link, label: e.texto }))];
}

/** A seção aparece na home? (mesmas regras da página: seção sem dado some, e sai do menu). */
export function secaoVisivel(s: SecaoHome, home: HomeContent, site: SiteContent): boolean {
  if (s === "historia") return home.historia.momentos.length > 0;
  if (s === "album") return home.album.fotos.length > 0;
  if (s === "programacao") return site.schedule.length > 0;
  if (s === "duvidas") return site.faq.length > 0;
  if (s === "traje") {
    const d = site.dressCode;
    return Boolean(d.text || d.palette.length || home.traje.foto);
  }
  return true;
}
