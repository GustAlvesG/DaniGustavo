import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FONT_IDS,
  paletteContrastIssues,
  PALETTE_TOKENS,
  resolveTheme,
  THEMES,
  THEME_IDS,
} from "@casamento/shared";
import { describe, expect, it } from "vitest";
import { fontStack, themeColors, themeFontIds, themeVars } from "./vars";

const css = (file: string) => readFileSync(join(__dirname, "..", "app", file), "utf8");

describe("paletas dos temas (WCAG 2.2 AA)", () => {
  const all = THEME_IDS.flatMap((t) => THEMES[t].palettes.map((p) => [`${t}/${p.id}`, p] as const));
  it.each(all)("%s passa em todos os pares de contraste", (_n, palette) => {
    expect(paletteContrastIssues(palette.colors)).toEqual([]);
  });

  it("todo tema tem pelo menos duas paletas e fontes só da lista curada", () => {
    for (const id of THEME_IDS) {
      const def = THEMES[id];
      expect(def.palettes.length).toBeGreaterThanOrEqual(2);
      for (const role of ["text", "ui", "script"] as const) {
        for (const f of def.fonts[role])
          expect(f === "none" || FONT_IDS.includes(f as never)).toBe(true);
      }
    }
  });
});

describe("themeVars", () => {
  it("Álbum/marinho gera exatamente as cores de globals.css", () => {
    const vars = themeVars(resolveTheme("wedding"));
    const globals = css("globals.css").toLowerCase();
    for (const token of PALETTE_TOKENS) {
      const value = vars[`--color-${token}`]!.toLowerCase();
      expect(globals, token).toContain(`--color-${token}: ${value};`);
    }
  });

  it("Álbum usa as fontes padrão de globals.css", () => {
    const vars = themeVars(resolveTheme("wedding"));
    const globals = css("globals.css");
    expect(vars["--tema-texto"]).toBe(
      'var(--font-cormorant-garamond), "Cormorant Garamond", Georgia, "Times New Roman", serif',
    );
    // O padrão de :root em globals.css aponta para as mesmas variáveis do next/font.
    expect(globals).toContain("--tema-texto: var(--font-cormorant-garamond)");
    expect(globals).toContain("--tema-ui: var(--font-jost)");
    expect(globals).toContain("--tema-script: var(--font-pinyon-script)");
    expect(vars["--tema-ui"]).toContain("var(--font-jost)");
    expect(vars["--tema-script"]).toContain("var(--font-pinyon-script)");
  });

  it("evento 15 anos resolve Festa e evento corporativo, Moderno", () => {
    const festa = themeVars(resolveTheme("fifteen"));
    expect(festa["--color-marinho"]).toBe(THEMES.festa.palettes[0]!.colors.marinho);
    expect(festa["--tema-texto"]).toContain("var(--font-dm-serif-display)");
    const moderno = themeVars(resolveTheme("corporate"));
    expect(moderno["--color-enfase"]).toBe(THEMES.moderno.palettes[0]!.colors.enfase);
    expect(moderno["--tema-ui"]).toContain("var(--font-inter)");
  });

  it("respeita a paleta e as fontes escolhidas", () => {
    const t = resolveTheme("other", {
      theme: "festa",
      palette: "lilas",
      fonts: { text: "playfair-display", script: "dancing-script" },
    });
    const vars = themeVars(t);
    expect(vars["--color-enfase"]).toBe("#5B3FA8");
    expect(vars["--tema-texto"]).toContain("var(--font-playfair-display)");
    expect(vars["--tema-script"]).toContain("var(--font-dancing-script)");
  });

  it("sem script, os nomes saem na fonte de texto; só as fontes usadas entram", () => {
    const t = resolveTheme("other", { theme: "moderno" });
    const vars = themeVars(t);
    expect(vars["--tema-script"]).toBe(vars["--tema-texto"]);
    expect(themeFontIds(t)).toEqual(["outfit", "inter"]);
    expect(themeFontIds(resolveTheme("wedding"))).toEqual([
      "cormorant-garamond",
      "jost",
      "pinyon-script",
    ]);
  });

  it("fonte desconhecida cai na pilha genérica do papel", () => {
    expect(fontStack("ui", "inexistente")).toContain("system-ui");
  });

  it("cores da barra e do fundo do app seguem o tema", () => {
    const album = themeColors(resolveTheme("wedding"));
    expect(album).toEqual({ bar: "#14213D", background: "#FAF7F1" });
  });
});
