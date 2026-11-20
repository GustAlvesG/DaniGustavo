import { siteDefaults, type SiteContent } from "@casamento/shared";
import { initialsOf } from "@/lib/site";

/** O mínimo do evento que a reserva usa (vem de `/api/hosts`). */
export type FallbackEvent = {
  slug: string;
  name: string;
  type: string;
  timezone: string;
  startsAt: string | null;
};

/** Data de reserva quando o evento ainda não tem data (só para a página montar). */
const NO_DATE = "2030-01-01T12:00:00-03:00";

/**
 * Conteúdo de reserva quando `/api/e/<slug>/site` não responde (build sem API, API fora do ar):
 * o site neutro do tipo com o nome, a data e o fuso que vieram de `/api/hosts`. Nada de um evento
 * específico mora aqui; o conteúdo de verdade vem do banco e se edita no painel.
 */
export function siteFallbackFor(ev: FallbackEvent): SiteContent {
  const datetime = ev.startsAt ?? NO_DATE;
  const local = {
    name: "Local a definir",
    address: "",
    lat: null,
    lng: null,
    time: "",
    mapsUrl: null,
    wazeUrl: null,
  };
  return {
    ...siteDefaults(ev.type),
    couple: { names: ev.name, monogram: initialsOf(ev.name), monogramArt: null },
    calendarUid: null,
    wedding: { datetime, timezone: ev.timezone },
    ceremony: local,
    reception: local,
    schedule: [],
    dressCode: { text: "", palette: [], avoid: [] },
    accommodation: { items: [], howToGetThere: "" },
    faq: [],
    godparents: { dressCode: "", schedule: [], palette: [], notes: [] },
    gallery: { items: [], officialPhotosSoon: false },
    contact: { whatsapp: "", email: "", message: "Alguma dúvida? Fale com a gente." },
    rsvp: { deadline: datetime },
    seo: { title: ev.name, description: "", ogTitle: ev.name, ogDescription: "" },
  };
}
