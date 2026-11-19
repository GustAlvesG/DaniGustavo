/**
 * O conteúdo fixo do casamento (src/content/*: textos, fotos de public/fotos, galeria,
 * manual dos padrinhos, versículo e o monograma DG) é do evento `dani-gustavo` e de mais
 * nenhum. Este é o ÚNICO ponto que decide isso: os outros eventos recebem uma versão
 * neutra, montada só com o que vem de `/api/e/<slug>/site` (nomes, data, locais...).
 *
 * TODO(fase2): o conteúdo de apresentação vira dado do evento (editor de conteúdo/temas)
 * e este arquivo some.
 */
import type { SiteContent } from "@casamento/shared";
import { galeria, type Galeria } from "@/content/galeria";
import { home, type HomeContent } from "@/content/home";
import { paginas, type Paginas } from "@/content/paginas";
import { SITE_FALLBACK } from "@/content/site-fallback";

/** Slug do casamento original (evento 1). */
export const LEGACY_EVENT_SLUG = "dani-gustavo";

/** O mínimo do evento que o conteúdo precisa (o resto vem de /api/e/<slug>/site). */
export type EventBasics = {
  slug: string;
  name: string;
  type: string;
  timezone: string;
  startsAt: string | null;
};

export type EventContent = {
  /** true só no casamento original: fotos, galeria, padrinhos e monograma DG. */
  legado: boolean;
  home: HomeContent;
  paginas: Paginas;
  /** null = sem página /galeria (404 e fora do menu). */
  galeria: Galeria | null;
  /** false = sem página /padrinhos (404 e fora do menu). */
  padrinhos: boolean;
  /** Iniciais do monograma em texto; null = a ligadura DG desenhada. */
  iniciais: string | null;
};

/** "Ana & Bruno" → "AB"; "Festa da Maria" → "FM"; "Lia" → "L". */
export function initialsOf(name: string): string {
  const words = name
    .split(/[\s&+]+/)
    .filter((w) => w && !/^(e|de|da|do|das|dos)$/i.test(w))
    .map((w) => w.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (!words.length) return "·";
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

/** Rótulo da seção principal do evento ("O casamento", "A festa"...). */
function eventLabel(type: string): string {
  if (type === "wedding") return "O casamento";
  if (type === "fifteen" || type === "birthday") return "A festa";
  return "O evento";
}

/** Home sem fotos nem textos do casal: as seções aparecem conforme os dados da API. */
function neutralHome(type: string): HomeContent {
  const evento = eventLabel(type);
  return {
    ...home,
    secoes: home.secoes.filter((s) => s !== "versiculo" && s !== "historia" && s !== "album"),
    hero: {
      ...home.hero,
      chamada: "Você é nosso convidado",
      fotoDesktop: null,
      fotoCelular: null,
      contador: {
        titulo: "Faltam para o grande dia",
        hoje: "É hoje! Nos vemos lá.",
        depois: "A festa foi em {data}. Obrigado por fazer parte.",
      },
    },
    historia: { ...home.historia, momentos: [] },
    album: { ...home.album, fotos: [], linkGaleria: "" },
    casamento: {
      ...home.casamento,
      menu: evento,
      rotulo: evento,
      lead: "",
      foto: null,
      legendaFoto: "",
    },
    versiculo: { ...home.versiculo, foto: null, linhas: [], referencia: "" },
    programacao: { ...home.programacao, lead: "" },
    traje: { ...home.traje, titulo: "Traje", lead: undefined, foto: null },
    presentes: {
      ...home.presentes,
      texto:
        "Se quiser presentear, a lista está aqui no site. Escolha um item ou contribua com o valor que quiser, no Pix ou no cartão.",
      foto: null,
      legendaFoto: "",
    },
    recados: {
      ...home.recados,
      titulo: "Palavras de *quem quer bem*",
      lead: "Os recados aparecem aqui depois de lidos pelos anfitriões.",
    },
    rsvp: { ...home.rsvp, fotos: [] },
    menu: { ...home.menu, extras: [] },
    rodape: {
      frase: "",
      links: home.rodape.links.filter((l) => l.link !== "/galeria" && l.link !== "/padrinhos"),
    },
  };
}

function neutralPaginas(): Paginas {
  return {
    padrinhos: { foto: null },
    recados: {
      ...paginas.recados,
      titulo: "Palavras de *quem quer bem*",
      lead: "Os recados aparecem aqui depois de lidos pelos anfitriões. Obrigado pelo carinho.",
      formLead: "Escreva o que quiser. Os anfitriões leem tudo, e o recado entra no mural depois.",
      privacidade:
        "Privacidade: guardamos só o nome e o texto que você escrever, para mostrar no mural depois de aprovado. Não pedimos e-mail nem guardamos o seu IP.",
      enviadoTexto: "Assim que for lido, ele aparece no mural.",
    },
    naoEncontrada: { foto: null, legenda: "" },
  };
}

/** O conteúdo de apresentação do evento: o do casamento original ou o neutro. */
export function contentFor(ev: Pick<EventBasics, "slug" | "name" | "type">): EventContent {
  if (ev.slug === LEGACY_EVENT_SLUG) {
    return { legado: true, home, paginas, galeria, padrinhos: true, iniciais: null };
  }
  return {
    legado: false,
    home: neutralHome(ev.type),
    paginas: neutralPaginas(),
    galeria: null,
    padrinhos: false,
    iniciais: initialsOf(ev.name),
  };
}

/**
 * Conteúdo de reserva quando `/api/e/<slug>/site` não responde: o do casamento só para
 * ele; os outros eventos saem com o nome e a data que já vieram de `/api/hosts`.
 */
export function siteFallbackFor(ev: EventBasics): SiteContent {
  if (ev.slug === LEGACY_EVENT_SLUG) return SITE_FALLBACK;
  const datetime = ev.startsAt ?? SITE_FALLBACK.wedding.datetime;
  const local = { ...SITE_FALLBACK.ceremony, name: "Local a definir", address: "", time: "" };
  return {
    ...SITE_FALLBACK,
    couple: { names: ev.name, monogram: initialsOf(ev.name) },
    wedding: { datetime, timezone: ev.timezone },
    ceremony: local,
    reception: local,
    schedule: [],
    dressCode: { text: "", palette: [], avoid: [] },
    accommodation: { items: [], howToGetThere: "" },
    faq: [],
    story: [],
    godparents: { dressCode: "", schedule: [], palette: [], notes: [] },
    gallery: { items: [], officialPhotosSoon: false },
    contact: { whatsapp: "", email: "", message: "Alguma dúvida? Fale com a gente." },
    rsvp: { deadline: datetime },
    seo: { title: ev.name, description: "", ogTitle: ev.name, ogDescription: "" },
  };
}
