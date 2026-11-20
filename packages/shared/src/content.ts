import { z } from "zod";
import { vocabularyFor, type Vocabulary } from "./event-types.ts";

/*
 * Conteúdo de apresentação do site por evento (Fase 2): textos e fotos das seções da home e das
 * páginas internas, que antes moravam em apps/web/src/content/*.ts. Fica em `event_settings` ›
 * `site.sections` (público), editado no painel (Site). Os DADOS do evento (data, locais,
 * programação, traje, FAQ, hospedagem, contato, manual dos padrinhos) continuam nas chaves de
 * sempre (`schedule.items`, `dresscode`...).
 *
 * Fotos: no banco ficam como `PhotoRef` (id em `event_media` + alt/posição próprios do uso); a
 * API troca por `Photo` (URL e tamanho) em `GET /api/e/:slug/site`. Por isso o schema é uma
 * fábrica: `siteSectionsSchema(PhotoRef)` valida o que se grava e `siteSectionsSchema(Photo)` o
 * que o site recebe.
 *
 * Textos: *palavra* sai em itálico com a cor de ênfase; `{prazo}` vira a data limite do RSVP;
 * `{data}` a data do evento. String vazia = sem aquele texto.
 */

/** CSS object-position simples ("center 30%", "40% center", "left top"). */
const position = z
  .string()
  .trim()
  .max(40)
  .regex(/^(?:(?:left|right|top|bottom|center|\d{1,3}%)\s*){1,2}$/, {
    error: "Posição: use algo como center 30% (horizontal e vertical).",
  });

/** Foto referenciada no conteúdo (como fica no banco). */
export const PhotoRef = z.object({
  mediaId: z.number().int().positive(),
  /** Vazio = usa o alt da foto em `event_media`. */
  alt: z.string().max(300).default(""),
  /** Vazio = usa a posição da foto em `event_media` (ou "center"). */
  position: z.union([z.literal(""), position]).default(""),
});
export type PhotoRef = z.infer<typeof PhotoRef>;

/** Foto pronta para o site (a API resolve PhotoRef → Photo). */
export const Photo = z.object({
  /** "/uploads/<eventId>/<arquivo>" (o Next repassa à API). */
  src: z.string().startsWith("/"),
  /** Miniatura, quando houver (galeria e grades). */
  thumbSrc: z.string().startsWith("/").nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string(),
  /** CSS object-position; null = center. */
  position: z.string().nullable(),
});
export type Photo = z.infer<typeof Photo>;

export const HOME_SECTION_IDS = [
  "story",
  "album",
  "event",
  "verse",
  "schedule",
  "dresscode",
  "gifts",
  "messages",
  "rsvp",
  "faq",
] as const;
export const HomeSectionId = z.enum(HOME_SECTION_IDS);
export type HomeSectionId = z.infer<typeof HomeSectionId>;

/** Nome de cada seção no editor do painel. */
export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  story: "Nossa história",
  album: "Álbum de fotos",
  event: "O evento (data e local)",
  verse: "Citação sobre foto",
  schedule: "Programação",
  dresscode: "Traje",
  gifts: "Presentes",
  messages: "Recados",
  rsvp: "Confirmação de presença",
  faq: "Dúvidas",
};

const text = (max = 300) => z.string().max(max).default("");
const link = z
  .string()
  .trim()
  .max(300)
  .regex(/^(\/|#|https:\/\/)/, { error: "Link: comece com /, # ou https://." });
const linkItem = z.object({ text: z.string().trim().min(1).max(80), link });

/** Bloco do conteúdo: ausente vira {} e cada campo cai no seu padrão (gravação parcial vale). */
const sec = <S extends z.core.$ZodLooseShape>(shape: S) =>
  z.object(shape).prefault({} as z.input<z.ZodObject<S>>);

/** Cabeçalho comum: menu (vazio = fora do menu), destino do menu, rótulo, título e frase. */
const header = {
  /** Texto do item no menu do topo; vazio = a seção não entra no menu. */
  menu: text(40),
  /** Destino do item do menu; vazio = âncora da seção na home. */
  menuLink: z.union([z.literal(""), link]).default(""),
  /** Rótulo pequeno acima do título. */
  label: text(80),
  title: text(200),
  lead: text(600),
};

export function siteSectionsSchema<P extends z.ZodType>(photo: P) {
  const optPhoto = photo.nullable().default(null);
  return z.object({
    /** Ordem das seções da home; `enabled: false` esconde sem perder o texto. */
    order: z
      .array(z.object({ id: HomeSectionId, enabled: z.boolean() }))
      .refine((l) => new Set(l.map((s) => s.id)).size === l.length, {
        error: "Seção repetida na ordem.",
      })
      .default(() => HOME_SECTION_IDS.map((id) => ({ id, enabled: true }))),
    /** Numerar os rótulos como páginas de álbum ("Página 1 · ..."). */
    numberPages: z.boolean().default(false),
    hero: sec({
      /** Linha pequena acima dos nomes; vazio = vocabulário do tipo (heroKicker). */
      kicker: text(120),
      photoDesktop: optPhoto,
      photoMobile: optPhoto,
      countdown: sec({ title: text(120), today: text(200), after: text(200) }),
    }),
    story: sec({
      ...header,
      items: z
        .array(
          z.object({
            year: text(20),
            title: text(120),
            text: text(600),
            photo: optPhoto,
          }),
        )
        .max(30)
        .default([]),
    }),
    album: sec({
      ...header,
      photos: z
        .array(z.object({ photo, caption: text(120) }))
        .max(24)
        .default([]),
      /** Texto do link para /galeria no fim da seção; vazio = sem link. */
      galleryLink: text(80),
    }),
    /** Seção "O casamento"/"A festa": o título é montado com a data. */
    event: sec({
      ...header,
      photo: optPhoto,
      photoCaption: text(120),
      accommodationTitle: text(80),
    }),
    verse: sec({
      photo: optPhoto,
      /** Cada linha aparece em sequência. */
      lines: z.array(z.string().max(200)).max(10).default([]),
      reference: text(80),
    }),
    schedule: sec({ ...header }),
    dresscode: sec({ ...header, photo: optPhoto }),
    gifts: sec({
      ...header,
      text: text(1000),
      photo: optPhoto,
      photoCaption: text(120),
      /** Sem botões, aparece o aviso. */
      buttons: z.array(linkItem).max(3).default([]),
      notice: text(200),
    }),
    messages: sec({
      ...header,
      /** Quantos recados aparecem na home. */
      count: z.number().int().min(1).max(12).default(3),
      seeAll: text(80),
      write: text(80),
      empty: text(200),
    }),
    rsvp: sec({
      ...header,
      /** {prazo} = data limite. */
      text: text(600),
      photos: z.array(photo).max(2).default([]),
      card: sec({ title: text(80), text: text(600), button: text(60) }),
    }),
    faq: sec({ ...header }),
    nav: sec({
      /** Botão de destaque do menu (leva a /confirmar). */
      cta: text(40),
      /** Links extras depois das seções. */
      extras: z.array(linkItem).max(6).default([]),
    }),
    footer: sec({
      phrase: text(300),
      links: z.array(linkItem).max(10).default([]),
    }),
    pages: sec({
      gallery: sec({
        title: text(80),
        /** Frase sob o título enquanto `gallery.official_soon` estiver ligado. */
        soonNotice: text(300),
      }),
      godparents: sec({ photo: optPhoto }),
      messages: sec({
        label: text(80),
        title: text(200),
        lead: text(600),
        empty: text(200),
        unavailable: text(200),
        formTitle: text(80),
        formLead: text(600),
        formButton: text(60),
        privacy: text(800),
        sentTitle: text(120),
        sentText: text(300),
      }),
      notFound: sec({ photo: optPhoto, caption: text(200) }),
    }),
  });
}

/** Como fica gravado em `site.sections` (fotos por id). */
export const SiteSections = siteSectionsSchema(PhotoRef);
export type SiteSections = z.infer<typeof SiteSections>;
export type SiteSectionsInput = z.input<typeof SiteSections>;

/** Como o site recebe (fotos resolvidas). */
export const PublicSiteSections = siteSectionsSchema(Photo);
export type PublicSiteSections = z.infer<typeof PublicSiteSections>;

/**
 * Conteúdo neutro de um evento sem `site.sections` (o de evento novo): sem fotos, textos pelo
 * vocabulário do tipo (o "site neutro" da Fase 1).
 */
export function defaultSections(type: string, vocabulary?: Vocabulary): SiteSections {
  const v = vocabulary ?? vocabularyFor(type);
  const on = (id: HomeSectionId) => ({ id, enabled: true });
  const off = (id: HomeSectionId) => ({ id, enabled: false });
  return SiteSections.parse({
    order: [
      off("story"),
      off("album"),
      on("event"),
      off("verse"),
      on("schedule"),
      on("dresscode"),
      on("gifts"),
      on("messages"),
      on("rsvp"),
      on("faq"),
    ],
    numberPages: true,
    hero: {
      kicker: v.heroKicker,
      countdown: { title: v.countdownTitle, today: v.countdownToday, after: v.countdownAfter },
    },
    story: { menu: "História", label: "Nossa história", title: "Nossa *história*" },
    album: { label: "Pelo caminho", title: "Do nosso *álbum*", galleryLink: "Ver todas as fotos" },
    event: { menu: v.eventLabel, label: v.eventLabel, accommodationTitle: "Onde ficar" },
    verse: {},
    schedule: { menu: "Programação", label: "Programação", title: "O dia, *hora a hora*" },
    dresscode: { menu: "Traje", label: "Dress code", title: "Traje" },
    gifts: {
      menu: "Presentes",
      menuLink: "/presentes",
      label: "Presentes",
      title: "Presença é o que *mais importa*",
      text: "Se quiser presentear, a lista está aqui no site. Escolha um item ou contribua com o valor que quiser, no Pix ou no cartão.",
      buttons: [{ text: "Ver a lista de presentes", link: "/presentes" }],
      notice: "A lista de presentes abre em breve, aqui mesmo.",
    },
    messages: {
      menu: "Recados",
      menuLink: "/recados",
      label: "Mural de recados",
      title: "Palavras de *quem quer bem*",
      lead: "Os recados aparecem aqui depois de lidos pelos anfitriões.",
      count: 3,
      seeAll: "Ver o mural todo",
      write: "Deixar um recado",
      empty: "Ainda não tem recado por aqui. Que tal ser a primeira pessoa a escrever?",
    },
    rsvp: {
      label: "Confirmação",
      title: "Conta pra gente se *você vem*",
      text: "Responda até {prazo}. Depois dessa data, fale direto com a gente.",
      card: {
        title: "Cartão-resposta",
        text: "Digite seu nome como está no convite e responda por todos do seu convite de uma vez. Leva um minuto, e dá para mudar depois.",
        button: "Confirmar presença",
      },
    },
    faq: { menu: "Dúvidas", label: "Dúvidas", title: "Perguntas *frequentes*" },
    nav: { cta: "Confirmar presença" },
    footer: {
      links: [
        { text: "Lista de presentes", link: "/presentes" },
        { text: "Mural de recados", link: "/recados" },
        { text: "Confirmar presença", link: "/confirmar" },
      ],
    },
    pages: {
      gallery: { title: "Galeria" },
      godparents: {},
      messages: {
        label: "Mural de recados",
        title: "Palavras de *quem quer bem*",
        lead: "Os recados aparecem aqui depois de lidos pelos anfitriões. Obrigado pelo carinho.",
        empty: "Ainda não tem recado por aqui. Que tal ser a primeira pessoa a escrever?",
        unavailable: "O mural não carregou agora. Recarregue a página em alguns instantes.",
        formTitle: "Deixe um recado",
        formLead:
          "Escreva o que quiser. Os anfitriões leem tudo, e o recado entra no mural depois.",
        formButton: "Enviar recado",
        privacy:
          "Privacidade: guardamos só o nome e o texto que você escrever, para mostrar no mural depois de aprovado. Não pedimos e-mail nem guardamos o seu IP.",
        sentTitle: "Recado enviado, obrigado!",
        sentText: "Assim que for lido, ele aparece no mural.",
      },
      notFound: {},
    },
  });
}

/** Ids de `event_media` usados no conteúdo (para resolver e para avisar antes de apagar). */
export function mediaIdsIn(sections: SiteSections): number[] {
  const ids = new Set<number>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.mediaId === "number") ids.add(o.mediaId);
      Object.values(o).forEach(visit);
    }
  };
  visit(sections);
  return [...ids];
}

/**
 * Troca cada PhotoRef pela foto resolvida. Foto que não existe mais (apagada) vira null onde a
 * foto é opcional e sai das listas (`album.photos`, `rsvp.photos`).
 */
export function resolveSections(
  sections: SiteSections,
  resolve: (ref: PhotoRef) => Photo | null,
): PublicSiteSections {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== null);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.mediaId === "number") return resolve(PhotoRef.parse(o));
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  const out = walk(sections) as PublicSiteSections;
  out.album.photos = out.album.photos.filter((p) => p.photo !== null);
  return PublicSiteSections.parse(out);
}
