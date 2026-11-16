/**
 * Helpers puros sobre o conteúdo de `/api/site` (sem React, sem servidor):
 * a home, as páginas internas, o .ics e a imagem OG usam os mesmos.
 */
import type { SiteContent, Venue } from "@casamento/shared";
import { addHours, DEFAULT_EVENT_HOURS, type CalendarEvent } from "./calendar";
import { WEDDING_TIME_ZONE } from "./countdown";

export type CoupleNames = { first: string; second: string };

/** "Dani & Gustavo" → { first: "Dani", second: "Gustavo" }. */
export function splitCoupleNames(names: string): CoupleNames {
  const [first, ...rest] = names.split(/\s*(?:&|\be\b)\s*/);
  const second = rest.join(" ").trim();
  return second ? { first: first.trim(), second } : { first: names.trim(), second: "" };
}

/** URL pública do site (sem barra no fim). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

const tzOf = (site: SiteContent) => site.wedding.timezone || WEDDING_TIME_ZONE;

/** "sábado, 15 de maio de 2027" */
export function formatLongDate(iso: string, timeZone = WEDDING_TIME_ZONE): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** "15 de abril" (sem ano) */
export function formatDayMonth(iso: string, timeZone = WEDDING_TIME_ZONE): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "numeric", month: "long" }).format(
    new Date(iso),
  );
}

/** "16h" ou "16h30" no fuso do casamento. */
export function formatHour(iso: string, timeZone = WEDDING_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return m === "00" ? `${h}h` : `${h}h${m}`;
}

export function hasAddress(v: Venue): boolean {
  return v.address.trim() !== "";
}

export function hasCoords(v: Venue): v is Venue & { lat: number; lng: number } {
  return typeof v.lat === "number" && typeof v.lng === "number";
}

function sameVenue(a: Venue, b: Venue): boolean {
  return a.name === b.name && a.address === b.address && a.lat === b.lat && a.lng === b.lng;
}

export type VenueBlock = { key: "cerimonia" | "recepcao" | "local"; title: string; venue: Venue };

/** Cerimônia e recepção; um bloco só quando os dois são o mesmo lugar. */
export function venueBlocks(site: SiteContent): VenueBlock[] {
  if (sameVenue(site.ceremony, site.reception)) {
    return [{ key: "local", title: "Cerimônia e recepção", venue: site.ceremony }];
  }
  return [
    { key: "cerimonia", title: "Cerimônia", venue: site.ceremony },
    { key: "recepcao", title: "Recepção", venue: site.reception },
  ];
}

/** Rótulo do local no hero: nome e, se houver, o endereço. */
export function venueLine(v: Venue): string {
  return hasAddress(v) ? `${v.name}, ${v.address}` : v.name;
}

/** Iframe do OpenStreetMap centrado nas coordenadas, com marcador. */
export function osmEmbedUrl(lat: number, lng: number, delta = 0.006): string {
  const bbox = [lng - delta, lat - delta * 0.6, lng + delta, lat + delta * 0.6]
    .map((n) => n.toFixed(5))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Link do WhatsApp (wa.me) ou null quando não há número. */
export function whatsappUrl(digits: string, text?: string): string | null {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return null;
  return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Evento da agenda: da cerimônia até o fim da festa. */
export function weddingEvent(site: SiteContent): CalendarEvent {
  const start = site.wedding.datetime;
  const date = start.slice(0, 10).replace(/-/g, "");
  const blocks = venueBlocks(site);
  const location = blocks
    .map((b) => venueLine(b.venue))
    .filter((l, i, all) => l && all.indexOf(l) === i)
    .join(" / ");
  const url = `${siteUrl()}/`;
  return {
    uid: `casamento-${date}@dani-e-gustavo`,
    title: `Casamento de ${site.couple.names}`,
    start,
    end: addHours(start, DEFAULT_EVENT_HOURS),
    location: location || undefined,
    description: `Cerimônia às ${formatHour(start, tzOf(site))}. Programação, local e confirmação de presença no site.`,
    url,
  };
}
