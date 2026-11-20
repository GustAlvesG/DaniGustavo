/**
 * PONTE TEMPORÁRIA da Fase 2 (some na integração, junto com `src/content/{home,galeria,
 * paginas}.ts`, `lib/fotos.ts` e `public/fotos`).
 *
 * O site já se monta só com `SiteContent` (`sections`, `gallery`, `event`). Enquanto o
 * conteúdo do casamento não foi importado para o banco (`content:import-legacy`, frente D),
 * o evento `dani-gustavo` chega da API com as seções neutras do tipo; aqui elas são trocadas
 * pela tradução de `content/*.ts` no mesmo formato (fotos de `public/fotos`). Depois da
 * importação, `site.sections` deixa de ser o neutro e esta ponte não age mais.
 */
import {
  defaultSections,
  PublicSiteSections,
  resolveSections,
  type GalleryPhoto,
  type Photo,
  type SiteContent,
} from "@casamento/shared";
import { galeria } from "@/content/galeria";
import { home, type Foto, type HomeContent } from "@/content/home";
import { paginas } from "@/content/paginas";
import { initialsOf } from "@/lib/site";

/** Slug do casamento original (evento 1). */
export const LEGACY_EVENT_SLUG = "dani-gustavo";

type EventRef = { slug: string; name: string };

/**
 * Iniciais do monograma em texto; null = a ligadura DG desenhada (só no casamento original).
 * TODO(fase2-integracao): decidir a arte do monograma pelo tema/conteúdo, não pelo slug.
 */
export function monogramFor(ev: EventRef): string | null {
  return ev.slug === LEGACY_EVENT_SLUG ? null : initialsOf(ev.name);
}

/** Tamanho das fotos de public/fotos (lido do disco no servidor). */
export type PhotoSize = (arquivo: string) => { src: string; width: number; height: number };

const toPhoto = (size: PhotoSize, f: Foto, alt = f.alt): Photo => {
  const info = size(f.arquivo);
  return {
    src: info.src,
    thumbSrc: null,
    width: info.width,
    height: info.height,
    alt,
    position: f.posicao ?? null,
  };
};

/** `content/{home,paginas,galeria}.ts` no formato de `site.sections` (fotos resolvidas). */
export function legacySections(size: PhotoSize): PublicSiteSections {
  const p = (f: Foto | null) => (f ? toPhoto(size, f) : null);
  const ids = {
    historia: "story",
    album: "album",
    casamento: "event",
    versiculo: "verse",
    programacao: "schedule",
    traje: "dresscode",
    presentes: "gifts",
    recados: "messages",
    rsvp: "rsvp",
    duvidas: "faq",
  } as const;
  const links = (l: { texto: string; link: string }[]) =>
    l.map((x) => ({ text: x.texto, link: x.link }));
  const r = paginas.recados;
  return PublicSiteSections.parse({
    order: home.secoes.map((s) => ({ id: ids[s], enabled: true })),
    numberPages: home.numerarPaginas,
    hero: {
      kicker: home.hero.chamada,
      photoDesktop: p(home.hero.fotoDesktop),
      photoMobile: p(home.hero.fotoCelular),
      countdown: {
        title: home.hero.contador.titulo,
        today: home.hero.contador.hoje,
        after: home.hero.contador.depois,
      },
    },
    story: {
      menu: home.historia.menu,
      label: home.historia.rotulo,
      title: home.historia.titulo,
      lead: home.historia.lead,
      items: home.historia.momentos.map((m) => ({
        year: m.ano,
        title: m.titulo,
        text: m.texto,
        photo: p(m.foto),
      })),
    },
    album: {
      label: home.album.rotulo,
      title: home.album.titulo,
      photos: home.album.fotos.map((f) => ({ photo: p(f), caption: f.legenda })),
      galleryLink: home.album.linkGaleria,
    },
    event: {
      menu: home.casamento.menu,
      label: home.casamento.rotulo,
      lead: home.casamento.lead,
      photo: p(home.casamento.foto),
      photoCaption: home.casamento.legendaFoto,
      accommodationTitle: home.casamento.tituloHospedagem,
    },
    verse: {
      photo: p(home.versiculo.foto),
      lines: home.versiculo.linhas,
      reference: home.versiculo.referencia,
    },
    schedule: {
      menu: home.programacao.menu,
      label: home.programacao.rotulo,
      title: home.programacao.titulo,
      lead: home.programacao.lead,
    },
    dresscode: {
      menu: home.traje.menu,
      label: home.traje.rotulo,
      title: home.traje.titulo,
      lead: home.traje.lead ?? "",
      photo: p(home.traje.foto),
    },
    gifts: {
      menu: home.presentes.menu,
      menuLink: home.presentes.menuLink,
      label: home.presentes.rotulo,
      title: home.presentes.titulo,
      text: home.presentes.texto,
      photo: p(home.presentes.foto),
      photoCaption: home.presentes.legendaFoto,
      buttons: links(home.presentes.botoes),
      notice: home.presentes.aviso,
    },
    messages: {
      menu: home.recados.menu,
      menuLink: home.recados.menuLink,
      label: home.recados.rotulo,
      title: home.recados.titulo,
      lead: home.recados.lead,
      count: home.recados.quantidade,
      seeAll: home.recados.verMural,
      write: home.recados.escrever,
      empty: home.recados.vazio,
    },
    rsvp: {
      label: home.rsvp.rotulo,
      title: home.rsvp.titulo,
      text: home.rsvp.texto,
      photos: home.rsvp.fotos.map((f) => toPhoto(size, f)),
      card: {
        title: home.rsvp.cartao.titulo,
        text: home.rsvp.cartao.texto,
        button: home.rsvp.cartao.botao,
      },
    },
    faq: { menu: home.duvidas.menu, label: home.duvidas.rotulo, title: home.duvidas.titulo },
    nav: { cta: home.menu.cta, extras: links(home.menu.extras) },
    footer: { phrase: home.rodape.frase, links: links(home.rodape.links) },
    pages: {
      gallery: { title: galeria.titulo, soonNotice: galeria.avisoPreWedding },
      godparents: { photo: p(paginas.padrinhos.foto) },
      messages: {
        label: r.rotulo,
        title: r.titulo,
        lead: r.lead,
        empty: r.vazio,
        unavailable: r.indisponivel,
        formTitle: r.formTitulo,
        formLead: r.formLead,
        formButton: r.formBotao,
        privacy: r.privacidade,
        sentTitle: r.enviadoTitulo,
        sentText: r.enviadoTexto,
      },
      notFound: { photo: p(paginas.naoEncontrada.foto), caption: paginas.naoEncontrada.legenda },
    },
  });
}

/** Fotos de `content/galeria.ts` no formato da galeria da API. */
export function legacyGallery(size: PhotoSize): GalleryPhoto[] {
  return galeria.fotos.map((f) => ({
    ...toPhoto(size, f),
    caption: f.legenda ?? "",
    album: null,
  }));
}

/** As seções são as neutras do tipo (nada gravado em `site.sections`)? */
export function hasDefaultSections(site: SiteContent): boolean {
  const neutral = resolveSections(
    defaultSections(site.event.type, site.event.vocabulary),
    () => null,
  );
  return JSON.stringify(site.sections) === JSON.stringify(neutral);
}

/**
 * Conteúdo do casamento original enquanto ele não está no banco: seções e galeria de
 * `content/*.ts`. Qualquer outro evento, ou o casamento já importado, passa direto.
 */
export function withLegacyContent(
  ev: { slug: string },
  site: SiteContent,
  size: PhotoSize,
): SiteContent {
  if (ev.slug !== LEGACY_EVENT_SLUG || !hasDefaultSections(site)) return site;
  return {
    ...site,
    sections: legacySections(size),
    gallery: { ...site.gallery, items: legacyGallery(size) },
  };
}

export type EventContent = {
  legado: boolean;
  /** Iniciais do monograma em texto; null = a ligadura DG. */
  iniciais: string | null;
  /** Só o que a imagem OG (frente C) ainda lê: a foto do hero no celular. */
  home: { hero: Pick<HomeContent["hero"], "fotoCelular"> };
};

/**
 * @deprecated Fase 2: o site lê `SiteContent.sections`. Mantido só para os ícones e a imagem
 * OG (frente C) até a integração.
 */
export function contentFor(ev: EventRef): EventContent {
  const legado = ev.slug === LEGACY_EVENT_SLUG;
  return {
    legado,
    iniciais: monogramFor(ev),
    home: { hero: { fotoCelular: legado ? home.hero.fotoCelular : null } },
  };
}
