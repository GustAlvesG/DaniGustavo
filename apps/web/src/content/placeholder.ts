import type { SiteContent } from "@casamento/shared";
import { cityFromAddress, splitCoupleNames } from "@/lib/site";
import { SITE_FALLBACK } from "./site-fallback";

/** O que o hero precisa; a home monta a partir de `/api/site`. */
export type HeroContent = {
  names: { first: string; second: string };
  /** Instante da cerimônia, com fuso (ISO 8601). */
  dateISO: string;
  timeZone: string;
  /** Nome do local (ex.: "Solare Roma"). */
  venueName: string;
  /** Cidade e UF (ex.: "Volta Redonda, RJ"); vazio se não houver endereço. */
  venueCity: string;
  rsvpHref: string;
  giftsHref: string;
};

export function heroFromSite(site: SiteContent): HeroContent {
  return {
    names: splitCoupleNames(site.couple.names),
    dateISO: site.wedding.datetime,
    timeZone: site.wedding.timezone,
    venueName: site.ceremony.name,
    venueCity: cityFromAddress(site.ceremony.address),
    rsvpHref: "/confirmar",
    giftsHref: "/presentes",
  };
}

/** Prévia do hero na /dev/design (conteúdo de reserva). */
export const heroPlaceholder: HeroContent = heroFromSite(SITE_FALLBACK);
