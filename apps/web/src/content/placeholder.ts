import type { SiteContent } from "@casamento/shared";
import { splitCoupleNames, venueLine } from "@/lib/site";
import { SITE_FALLBACK } from "./site-fallback";

/** O que o hero precisa; a home monta a partir de `/api/site`. */
export type HeroContent = {
  names: { first: string; second: string };
  /** Instante da cerimônia, com fuso (ISO 8601). */
  dateISO: string;
  venueLabel: string;
  rsvpHref: string;
  giftsHref: string;
};

export function heroFromSite(site: SiteContent): HeroContent {
  return {
    names: splitCoupleNames(site.couple.names),
    dateISO: site.wedding.datetime,
    venueLabel: venueLine(site.ceremony),
    rsvpHref: "/confirmar",
    giftsHref: "/presentes",
  };
}

/** Prévia do hero na /dev/design (conteúdo de reserva). */
export const heroPlaceholder: HeroContent = heroFromSite(SITE_FALLBACK);
