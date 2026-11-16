import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const isoDateTime = z.iso.datetime({ offset: true });

export const Venue = z.object({
  name: z.string(),
  address: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  /** Horário de início, texto livre (ex.: "16h"). Vazio enquanto não definido. */
  time: z.string(),
  /** Calculado pela API; null quando não há endereço nem coordenadas. */
  mapsUrl: z.url().nullable(),
  wazeUrl: z.url().nullable(),
});
export type Venue = z.infer<typeof Venue>;

export const PaletteColor = z.object({ name: z.string(), hex });
export type PaletteColor = z.infer<typeof PaletteColor>;

export const ScheduleItem = z.object({ time: z.string(), title: z.string(), text: z.string() });
export type ScheduleItem = z.infer<typeof ScheduleItem>;

export const AccommodationItem = z.object({
  name: z.string(),
  distance: z.string(),
  url: z.url().nullable(),
  note: z.string(),
});
export type AccommodationItem = z.infer<typeof AccommodationItem>;

export const FaqItem = z.object({ question: z.string(), answer: z.string() });
export type FaqItem = z.infer<typeof FaqItem>;

export const StoryMoment = z.object({
  id: z.string(),
  when: z.string(),
  title: z.string(),
  text: z.string(),
  image: z.string().startsWith("/"),
  imageAlt: z.string(),
});
export type StoryMoment = z.infer<typeof StoryMoment>;

/** Manual dos padrinhos. Os campos depois de `notes` são opcionais (aditivos) e vêm do manual do casal. */
export const GodparentsManual = z.object({
  dressCode: z.string(),
  schedule: z.array(z.object({ time: z.string(), text: z.string() })),
  palette: z.array(PaletteColor),
  notes: z.array(z.string()),
  /** Texto do convite para ser padrinho/madrinha. */
  invitation: z.string().optional(),
  bridesmaids: z
    .object({
      text: z.string(),
      /** Cor de inspiração (ex.: azul serenity). */
      inspiration: PaletteColor,
    })
    .optional(),
  groomsmen: z
    .object({
      text: z.string(),
      /** Resumo do traje em uma linha. */
      summary: z.string(),
    })
    .optional(),
  missions: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
  missionsClosing: z.string().optional(),
  music: z
    .object({
      text: z.string(),
      playlistUrl: z.url().nullable(),
      albumText: z.string(),
      albumUrl: z.url().nullable(),
    })
    .optional(),
  /** Orientações "para o grande dia". */
  bigDay: z.array(z.string()).optional(),
  verse: z.object({ text: z.string(), reference: z.string() }).optional(),
});
export type GodparentsManual = z.infer<typeof GodparentsManual>;

export const GalleryPhoto = z.object({
  src: z.string().startsWith("/"),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type GalleryPhoto = z.infer<typeof GalleryPhoto>;

/** Resposta de GET /api/site. */
export const SiteContent = z.object({
  couple: z.object({ names: z.string(), monogram: z.string() }),
  wedding: z.object({ datetime: isoDateTime, timezone: z.string() }),
  ceremony: Venue,
  reception: Venue,
  schedule: z.array(ScheduleItem),
  dressCode: z.object({
    text: z.string(),
    palette: z.array(PaletteColor),
    avoid: z.array(z.string()),
  }),
  accommodation: z.object({
    items: z.array(AccommodationItem),
    howToGetThere: z.string(),
  }),
  faq: z.array(FaqItem),
  story: z.array(StoryMoment),
  godparents: GodparentsManual,
  gallery: z.object({
    items: z.array(GalleryPhoto),
    /** true enquanto as fotos oficiais não foram publicadas. */
    officialPhotosSoon: z.boolean(),
  }),
  contact: z.object({
    /** Só dígitos com DDI (ex.: 5511900000000) ou vazio. */
    whatsapp: z.string(),
    email: z.string(),
    message: z.string(),
  }),
  rsvp: z.object({ deadline: isoDateTime }),
  seo: z.object({
    title: z.string(),
    description: z.string(),
    ogTitle: z.string(),
    ogDescription: z.string(),
  }),
});
export type SiteContent = z.infer<typeof SiteContent>;
