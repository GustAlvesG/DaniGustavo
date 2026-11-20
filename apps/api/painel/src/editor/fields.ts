import { HOME_SECTION_LABELS, type HomeSectionId } from "@casamento/shared";

/*
 * Descrição dos campos do editor do site: o painel desenha os formulários a partir disto, e o
 * servidor valida tudo com `SiteSections` (packages/shared/src/content.ts). Caminhos em ponto
 * (`hero.countdown.title`) valem para `getPath`/`setPath`.
 */

export type FieldKind = "text" | "textarea" | "number" | "photo" | "lines" | "link";

export interface FieldSpec {
  path: string;
  label: string;
  kind?: FieldKind;
  hint?: string;
}

/** Lista de itens com campos de texto (caminhos relativos ao item). */
export interface ListSpec {
  path: string;
  label: string;
  itemLabel: string;
  max: number;
  fields: FieldSpec[];
  blank: Record<string, unknown>;
  /** Campo do item usado como nome nos botões ("Subir <nome>"). */
  nameField: string;
}

/** Lista de fotos escolhidas da galeria: `photos` com legenda por foto, ou só PhotoRef. */
export interface PhotoListSpec {
  path: string;
  label: string;
  max: number;
  /** Itens são { photo, caption } (true) ou o próprio PhotoRef (false). */
  withCaption: boolean;
}

export interface SectionSpec {
  id: string;
  title: string;
  description?: string;
  fields: FieldSpec[];
  lists?: ListSpec[];
  photoLists?: PhotoListSpec[];
}

/** Cabeçalho comum das seções da home. */
const header = (p: string): FieldSpec[] => [
  { path: `${p}.menu`, label: "Texto no menu", hint: "Vazio: a seção não aparece no menu." },
  { path: `${p}.label`, label: "Rótulo pequeno (acima do título)" },
  { path: `${p}.title`, label: "Título" },
  { path: `${p}.lead`, label: "Frase de apoio", kind: "textarea" },
];

const linkItemFields: FieldSpec[] = [
  { path: "text", label: "Texto do botão/link" },
  { path: "link", label: "Destino", kind: "link", hint: "Comece com /, # ou https://." },
];

export const SECTION_SPECS: SectionSpec[] = [
  {
    id: "hero",
    title: "Abertura",
    fields: [
      { path: "hero.kicker", label: "Linha acima dos nomes", hint: "Vazio: texto padrão do tipo." },
      { path: "hero.photoDesktop", label: "Foto (computador)", kind: "photo" },
      { path: "hero.photoMobile", label: "Foto (celular)", kind: "photo" },
      { path: "hero.countdown.title", label: "Contagem: título" },
      { path: "hero.countdown.today", label: "Contagem: texto no dia" },
      { path: "hero.countdown.after", label: "Contagem: texto depois do dia" },
    ],
  },
  {
    id: "story",
    title: HOME_SECTION_LABELS.story,
    fields: header("story"),
    lists: [
      {
        path: "story.items",
        label: "Momentos",
        itemLabel: "Momento",
        max: 30,
        nameField: "title",
        blank: { year: "", title: "", text: "", photo: null },
        fields: [
          { path: "year", label: "Quando" },
          { path: "title", label: "Título" },
          { path: "text", label: "Texto", kind: "textarea" },
          { path: "photo", label: "Foto", kind: "photo" },
        ],
      },
    ],
  },
  {
    id: "album",
    title: HOME_SECTION_LABELS.album,
    fields: [
      ...header("album"),
      {
        path: "album.galleryLink",
        label: "Texto do link para a galeria",
        hint: "Vazio: sem link.",
      },
    ],
    photoLists: [{ path: "album.photos", label: "Fotos do álbum", max: 24, withCaption: true }],
  },
  {
    id: "event",
    title: HOME_SECTION_LABELS.event,
    fields: [
      ...header("event"),
      { path: "event.photo", label: "Foto", kind: "photo" },
      { path: "event.photoCaption", label: "Legenda da foto" },
      { path: "event.accommodationTitle", label: "Título da hospedagem" },
    ],
  },
  {
    id: "verse",
    title: HOME_SECTION_LABELS.verse,
    fields: [
      { path: "verse.photo", label: "Foto de fundo", kind: "photo" },
      { path: "verse.lines", label: "Linhas da citação", kind: "lines", hint: "Uma por linha." },
      { path: "verse.reference", label: "Referência" },
    ],
  },
  { id: "schedule", title: HOME_SECTION_LABELS.schedule, fields: header("schedule") },
  {
    id: "dresscode",
    title: HOME_SECTION_LABELS.dresscode,
    fields: [...header("dresscode"), { path: "dresscode.photo", label: "Foto", kind: "photo" }],
  },
  {
    id: "gifts",
    title: HOME_SECTION_LABELS.gifts,
    fields: [
      ...header("gifts"),
      { path: "gifts.text", label: "Texto", kind: "textarea" },
      { path: "gifts.photo", label: "Foto", kind: "photo" },
      { path: "gifts.photoCaption", label: "Legenda da foto" },
      { path: "gifts.notice", label: "Aviso sem botões" },
    ],
    lists: [
      {
        path: "gifts.buttons",
        label: "Botões",
        itemLabel: "Botão",
        max: 3,
        nameField: "text",
        blank: { text: "", link: "/" },
        fields: linkItemFields,
      },
    ],
  },
  {
    id: "messages",
    title: HOME_SECTION_LABELS.messages,
    fields: [
      ...header("messages"),
      { path: "messages.count", label: "Recados na home (1 a 12)", kind: "number" },
      { path: "messages.seeAll", label: "Texto de “ver todos”" },
      { path: "messages.write", label: "Texto de “deixar um recado”" },
      { path: "messages.empty", label: "Texto quando não há recados" },
    ],
  },
  {
    id: "rsvp",
    title: HOME_SECTION_LABELS.rsvp,
    fields: [
      ...header("rsvp"),
      { path: "rsvp.text", label: "Texto", kind: "textarea", hint: "{prazo} vira a data limite." },
      { path: "rsvp.card.title", label: "Cartão: título" },
      { path: "rsvp.card.text", label: "Cartão: texto", kind: "textarea" },
      { path: "rsvp.card.button", label: "Cartão: botão" },
    ],
    photoLists: [{ path: "rsvp.photos", label: "Fotos", max: 2, withCaption: false }],
  },
  { id: "faq", title: HOME_SECTION_LABELS.faq, fields: header("faq") },
  {
    id: "nav",
    title: "Menu do topo",
    fields: [
      { path: "nav.cta", label: "Botão de destaque", hint: "Leva à confirmação de presença." },
    ],
    lists: [
      {
        path: "nav.extras",
        label: "Links extras",
        itemLabel: "Link",
        max: 6,
        nameField: "text",
        blank: { text: "", link: "/" },
        fields: linkItemFields,
      },
    ],
  },
  {
    id: "footer",
    title: "Rodapé",
    fields: [{ path: "footer.phrase", label: "Frase", kind: "textarea" }],
    lists: [
      {
        path: "footer.links",
        label: "Links",
        itemLabel: "Link",
        max: 10,
        nameField: "text",
        blank: { text: "", link: "/" },
        fields: linkItemFields,
      },
    ],
  },
  {
    id: "pages",
    title: "Páginas internas",
    fields: [
      { path: "pages.gallery.title", label: "Galeria: título" },
      {
        path: "pages.gallery.soonNotice",
        label: "Galeria: aviso “fotos em breve”",
        kind: "textarea",
      },
      { path: "pages.godparents.photo", label: "Padrinhos: foto", kind: "photo" },
      { path: "pages.messages.label", label: "Recados: rótulo" },
      { path: "pages.messages.title", label: "Recados: título" },
      { path: "pages.messages.lead", label: "Recados: frase", kind: "textarea" },
      { path: "pages.messages.empty", label: "Recados: sem recados" },
      { path: "pages.messages.unavailable", label: "Recados: indisponível" },
      { path: "pages.messages.formTitle", label: "Recados: título do formulário" },
      { path: "pages.messages.formLead", label: "Recados: frase do formulário", kind: "textarea" },
      { path: "pages.messages.formButton", label: "Recados: botão" },
      { path: "pages.messages.privacy", label: "Recados: aviso de privacidade", kind: "textarea" },
      { path: "pages.messages.sentTitle", label: "Recados: título após enviar" },
      { path: "pages.messages.sentText", label: "Recados: texto após enviar" },
      { path: "pages.notFound.photo", label: "Página não encontrada: foto", kind: "photo" },
      { path: "pages.notFound.caption", label: "Página não encontrada: legenda" },
    ],
  },
];

export type { HomeSectionId };
