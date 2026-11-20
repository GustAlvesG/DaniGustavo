import { describe, expect, it } from "vitest";
import {
  ALBUM_MARINHO,
  defaultModules,
  defaultSections,
  defaultSides,
  EVENT_TYPES,
  EventSides,
  mediaIdsIn,
  moduleOfPath,
  modulesFor,
  paletteContrastIssues,
  PublicSiteSections,
  resolveSections,
  resolveTheme,
  SiteSections,
  THEMES,
  ThemeSelection,
  vocabularyFor,
  type Photo,
} from "../src/index.ts";

describe("temas", () => {
  const palettes = Object.values(THEMES).flatMap((t) =>
    t.palettes.map((p) => [`${t.id}/${p.id}`, p.colors] as const),
  );
  it.each(palettes)("a paleta %s passa na WCAG AA em todos os pares", (_, colors) => {
    expect(paletteContrastIssues(colors)).toEqual([]);
  });

  it("o tema Álbum começa pela paleta atual do site", () => {
    expect(THEMES.album.palettes[0]!.colors).toBe(ALBUM_MARINHO);
    expect(resolveTheme("wedding")).toMatchObject({
      theme: "album",
      palette: "marinho",
      fonts: { text: "cormorant-garamond", ui: "jost", script: "pinyon-script" },
    });
  });

  it("escolha inválida cai no padrão do tipo", () => {
    expect(resolveTheme("fifteen", { theme: "album", palette: "nao-existe" }).theme).toBe("festa");
    expect(resolveTheme("corporate", null).theme).toBe("moderno");
    expect(
      ThemeSelection.safeParse({ theme: "moderno", fonts: { script: "pinyon-script" } }).success,
    ).toBe(false);
  });
});

describe("vocabulário e lados", () => {
  it("cada tipo tem todas as palavras e a troca do evento prevalece", () => {
    for (const t of EVENT_TYPES) expect(vocabularyFor(t).eventLabel).not.toBe("");
    expect(vocabularyFor("wedding").eventLabel).toBe("O casamento");
    expect(vocabularyFor("fifteen", { godparents: "Damas" }).godparents).toBe("Damas");
    expect(vocabularyFor("tipo-novo").eventLabel).toBe("O evento");
  });

  it("valida os lados (chave única, formato)", () => {
    expect(EventSides.safeParse(defaultSides("wedding")).success).toBe(true);
    expect(
      EventSides.safeParse([
        { key: "a", label: "A" },
        { key: "a", label: "B" },
      ]).success,
    ).toBe(false);
    expect(EventSides.safeParse([{ key: "Lado A", label: "A" }]).success).toBe(false);
    expect(EventSides.safeParse([]).success).toBe(false);
  });
});

describe("módulos", () => {
  it("padrinhos só em casamento e 15 anos; gravado prevalece", () => {
    expect(defaultModules("wedding").godparents).toBe(true);
    expect(defaultModules("birthday").godparents).toBe(false);
    expect(modulesFor("wedding", { gifts: false }).gifts).toBe(false);
    expect(modulesFor("wedding", { gifts: false }).messages).toBe(true);
  });

  it("acha o módulo pelo caminho", () => {
    expect(moduleOfPath("/presentes/air-fryer")).toBe("gifts");
    expect(moduleOfPath("/c/01ABC")).toBe("rsvp");
    expect(moduleOfPath("/")).toBeNull();
    expect(moduleOfPath("/confirmado")).toBeNull();
  });
});

describe("conteúdo das seções", () => {
  it("o neutro de cada tipo é válido e gravação vazia ganha os padrões", () => {
    for (const t of EVENT_TYPES) expect(() => SiteSections.parse(defaultSections(t))).not.toThrow();
    const empty = SiteSections.parse({});
    expect(empty.order).toHaveLength(10);
    expect(empty.messages.count).toBe(3);
    expect(empty.hero.photoDesktop).toBeNull();
  });

  it("resolve as fotos e tira as que não existem mais", () => {
    const sections = SiteSections.parse({
      hero: { photoDesktop: { mediaId: 1 }, photoMobile: { mediaId: 99 } },
      album: { photos: [{ photo: { mediaId: 1 }, caption: "A" }, { photo: { mediaId: 99 } }] },
      rsvp: { photos: [{ mediaId: 99 }, { mediaId: 1, alt: "Outro alt" }] },
    });
    expect(mediaIdsIn(sections).sort()).toEqual([1, 99]);
    const photo = (alt: string): Photo => ({
      src: "/uploads/1/a.jpg",
      thumbSrc: null,
      width: 800,
      height: 600,
      alt,
      position: null,
    });
    const out = resolveSections(sections, (ref) =>
      ref.mediaId === 1 ? photo(ref.alt || "Alt da foto") : null,
    );
    expect(PublicSiteSections.safeParse(out).success).toBe(true);
    expect(out.hero.photoDesktop?.alt).toBe("Alt da foto");
    expect(out.hero.photoMobile).toBeNull();
    expect(out.album.photos).toHaveLength(1);
    expect(out.rsvp.photos.map((p) => p.alt)).toEqual(["Outro alt"]);
  });
});
