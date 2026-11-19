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

/** URL pública do site (sem barra no fim), do .env; reserva quando não há host do evento. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** URL base de um host de evento: http em localhost/*.localhost, https no resto. */
export function hostUrl(host: string): string {
  const name = host.replace(/:\d+$/, "");
  const local = name === "localhost" || name.endsWith(".localhost") || name === "127.0.0.1";
  return `${local ? "http" : "https"}://${host}`;
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

/**
 * Data em números com pontos: "10 · 04 · 2027" (longa, hero e rodapé) ou
 * "10·04·27" (curta, menu no celular), no fuso do casamento.
 */
export function formatDotDate(
  iso: string,
  timeZone = WEDDING_TIME_ZONE,
  { short = false }: { short?: boolean } = {},
): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: short ? "2-digit" : "numeric",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return [get("day"), get("month"), get("year")].join(short ? "·" : " · ");
}

/**
 * Título da seção do casamento, com o dia e o mês em ênfase (asteriscos,
 * ver lib/texto): "Sábado, *10 de abril* de 2027".
 */
export function weddingHeadline(iso: string, timeZone = WEDDING_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const day = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${day}, *${get("day")} de ${get("month")}* de ${get("year")}`;
}

/**
 * Cidade e UF de um endereço no formato dos Correios:
 * "R. Papagaio, 1800 - Roma, Volta Redonda - RJ, 27257-770" → "Volta Redonda, RJ".
 * Vazio quando não reconhece.
 */
export function cityFromAddress(address: string): string {
  for (const part of address.split(",").map((p) => p.trim())) {
    const m = /^(.+?)\s+-\s+([A-Z]{2})$/.exec(part);
    if (m) return `${m[1]}, ${m[2]}`;
  }
  return "";
}

export type MonthGrid = {
  /** "abril" */
  month: string;
  year: number;
  day: number;
  /** Semanas de domingo a sábado; null fora do mês. */
  weeks: (number | null)[][];
};

/** Calendário do mês do casamento (domingo primeiro), como no "save the date" do manual. */
export function monthGrid(iso: string, timeZone = WEDDING_TIME_ZONE): MonthGrid {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(iso));
  const num = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const year = num("year");
  const monthIndex = num("month") - 1;
  const day = num("day");
  const first = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthIndex, 15)),
  );
  return { month, year, day, weeks };
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

/** Link do Google Maps: o do banco, ou uma busca pelo nome e endereço do local. */
export function mapsLink(v: Venue): string {
  if (v.mapsUrl) return v.mapsUrl;
  const query = hasAddress(v) ? `${v.name}, ${v.address}` : v.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

/** De qual evento é a agenda: slug (no UID), tipo (no título) e a URL do site. */
export type CalendarSource = { slug: string; type: string; baseUrl: string };

/** Evento da agenda: da cerimônia até o fim da festa. */
export function weddingEvent(
  site: SiteContent,
  source: CalendarSource = { slug: "dani-gustavo", type: "wedding", baseUrl: siteUrl() },
): CalendarEvent {
  const start = site.wedding.datetime;
  const date = start.slice(0, 10).replace(/-/g, "");
  const blocks = venueBlocks(site);
  const location = blocks
    .map((b) => venueLine(b.venue))
    .filter((l, i, all) => l && all.indexOf(l) === i)
    .join(" / ");
  const wedding = source.type === "wedding";
  // O UID do casamento original não muda: quem já salvou na agenda não ganha um duplicado.
  const uid =
    source.slug === "dani-gustavo"
      ? `casamento-${date}@dani-e-gustavo`
      : `evento-${date}@${source.slug}`;
  return {
    uid,
    title: wedding ? `Casamento de ${site.couple.names}` : site.couple.names,
    start,
    end: addHours(start, DEFAULT_EVENT_HOURS),
    location: location || undefined,
    description: `${wedding ? "Cerimônia" : "Início"} às ${formatHour(start, tzOf(site))}. Programação, local e confirmação de presença no site.`,
    url: `${source.baseUrl}/`,
  };
}
