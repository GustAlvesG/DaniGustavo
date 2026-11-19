import { and, byEvent, eq, eventSettings, type Database } from "@casamento/db";
import { SiteContent, type Venue } from "@casamento/shared";
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

/** Monta e valida o conteúdo de GET /api/site. Lança se faltar chave ou o formato estiver errado. */
export function buildSiteContent(s: Map<string, unknown>): SiteContent {
  // Chave ausente vira valor neutro (evento criado pela CLI só tem o básico); inválida continua lançando.
  const get = (key: string, fallback?: unknown): unknown => (s.has(key) ? s.get(key) : fallback);
  const names = get("couple.names");
  const datetime = get("wedding.datetime");
  return SiteContent.parse({
    couple: { names, monogram: get("couple.monogram") },
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
    story: get("story.items", []),
    godparents: get("godparents.manual", { dressCode: "", schedule: [], palette: [], notes: [] }),
    gallery: {
      items: get("gallery.items", []),
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
