import { and, asc, byEvent, eq, eventMedia, eventSettings, type Database } from "@casamento/db";
import {
  defaultSections,
  modulesFor,
  resolveSections,
  resolveTheme,
  SiteContent,
  SiteSections,
  vocabularyFor,
  VocabularyOverrides,
  type EventModulesInput,
  type Photo,
  type PhotoRef,
  type Venue,
} from "@casamento/shared";
import type { EventCtx } from "./tenancy/types.ts";

interface StoredVenue {
  name?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  time?: string;
  /** Link de mapa escolhido no painel (substitui o calculado). */
  mapsUrl?: string | null;
}

/** Links de mapa calculados a partir do endereço/coordenadas; null se não houver nenhum. */
export function venueLinks(v: StoredVenue): Pick<Venue, "mapsUrl" | "wazeUrl"> {
  const address = v.address?.trim() ?? "";
  const hasCoords = typeof v.lat === "number" && typeof v.lng === "number";
  if (!hasCoords && !address) return { mapsUrl: v.mapsUrl || null, wazeUrl: null };
  const query = hasCoords ? `${v.lat},${v.lng}` : address;
  return {
    mapsUrl:
      v.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    wazeUrl: hasCoords
      ? `https://waze.com/ul?ll=${v.lat},${v.lng}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`,
  };
}

function venue(raw: unknown): Venue {
  const v = (raw ?? {}) as StoredVenue;
  return {
    name: v.name ?? "Local a definir",
    address: v.address ?? "",
    lat: v.lat ?? null,
    lng: v.lng ?? null,
    time: v.time ?? "",
    ...venueLinks(v),
  };
}

/** Lê as configurações públicas do evento (`event_settings.is_public`) como mapa chave → valor. */
export async function readPublicSettings(
  ev: EventCtx,
  db: Database,
): Promise<Map<string, unknown>> {
  const rows = await db
    .select()
    .from(eventSettings)
    .where(and(byEvent(eventSettings, ev), eq(eventSettings.isPublic, true)));
  return new Map(rows.map((r) => [r.key, r.value]));
}

export type MediaRow = typeof eventMedia.$inferSelect;

/** Fotos do evento, na ordem da galeria. */
export async function readEventMedia(ev: EventCtx, db: Database): Promise<MediaRow[]> {
  return db
    .select()
    .from(eventMedia)
    .where(byEvent(eventMedia, ev))
    .orderBy(asc(eventMedia.sort), asc(eventMedia.id));
}

const mediaUrl = (row: MediaRow, file: string) => `/uploads/${row.eventId}/${file}`;

/** Linha de event_media → foto do site (alt/posição do uso prevalecem sobre os da foto). */
export function mediaPhoto(row: MediaRow, ref?: Partial<PhotoRef>): Photo {
  return {
    src: mediaUrl(row, row.file),
    thumbSrc: row.thumbFile ? mediaUrl(row, row.thumbFile) : null,
    width: row.width,
    height: row.height,
    alt: ref?.alt || row.alt,
    position: ref?.position || row.position || null,
  };
}

/** Conteúdo público do evento: configurações públicas + fotos (GET /api/e/:slug/site). */
export async function loadSiteContent(ev: EventCtx, db: Database): Promise<SiteContent> {
  const [settings, media] = await Promise.all([readPublicSettings(ev, db), readEventMedia(ev, db)]);
  return buildSiteContent(settings, { type: ev.type, media });
}

/**
 * Monta e valida o conteúdo de GET /api/e/:slug/site. Lança se faltar chave ou o formato estiver
 * errado. `opts.type` é o tipo do evento (vocabulário, módulos e tema padrão); `opts.media`, as
 * fotos de `event_media` (resolvem as fotos das seções e formam a galeria).
 */
export function buildSiteContent(
  s: Map<string, unknown>,
  opts: { type: string; media?: MediaRow[] } = { type: "wedding" },
): SiteContent {
  // Chave ausente vira valor neutro (evento criado pela CLI só tem o básico); inválida continua lançando.
  const get = (key: string, fallback?: unknown): unknown => (s.has(key) ? s.get(key) : fallback);
  const names = get("couple.names");
  const datetime = get("wedding.datetime");
  const media = opts.media ?? [];
  const byId = new Map(media.map((m) => [m.id, m]));
  const vocabulary = vocabularyFor(
    opts.type,
    VocabularyOverrides.parse(get("event.vocabulary", {})),
  );
  const stored = get("site.sections");
  const sections =
    stored === undefined ? defaultSections(opts.type, vocabulary) : SiteSections.parse(stored);
  const galleryMedia = media.filter((m) => m.inGallery);
  return SiteContent.parse({
    event: {
      type: opts.type,
      modules: modulesFor(opts.type, get("event.modules", {}) as EventModulesInput),
      vocabulary,
    },
    theme: resolveTheme(opts.type, get("site.theme")),
    sections: resolveSections(sections, (ref) => {
      const row = byId.get(ref.mediaId);
      return row ? mediaPhoto(row, ref) : null;
    }),
    couple: {
      names,
      monogram: get("couple.monogram"),
      monogramArt: get("couple.monogram_art", null),
    },
    calendarUid: get("calendar.uid", null),
    wedding: { datetime, timezone: get("wedding.timezone") },
    ceremony: venue(get("ceremony.venue")),
    reception: venue(get("reception.venue")),
    schedule: get("schedule.items", []),
    dressCode: get("dresscode", { text: "", palette: [], avoid: [] }),
    accommodation: {
      items: get("accommodation.items", []),
      howToGetThere: get("accommodation.how_to_get_there", ""),
    },
    faq: get("faq.items", []),
    godparents: get("godparents.manual", { dressCode: "", schedule: [], palette: [], notes: [] }),
    gallery: {
      items: galleryMedia.map((m) => ({
        ...mediaPhoto(m),
        caption: m.caption,
        album: m.album,
      })),
      officialPhotosSoon: get("gallery.official_soon", false),
    },
    contact: get("couple.contact", {
      whatsapp: "",
      email: "",
      message: "Alguma dúvida? Fale com a gente.",
    }),
    rsvp: { deadline: get("rsvp.deadline", datetime) },
    seo: get("seo", {
      title: names,
      description: "",
      ogTitle: names,
      ogDescription: "",
    }),
  });
}
