import { z } from "zod";
import { contrastRatio } from "./color.ts";
import { eventTypeOf } from "./event-types.ts";

/*
 * Registro de temas do site (Fase 2). Um tema = desenho (CSS próprio no site, em
 * apps/web/src/themes/<id>) + paletas validadas por contraste + fontes de uma lista curada.
 * O evento escolhe em `event_settings` › `site.theme` (público); o layout `[host]` aplica as
 * cores como variáveis CSS (`--color-<token>`) e as fontes em `--font-serif`, `--font-sans`
 * e `--font-script`.
 *
 * Paleta nova: acrescente aqui; `themes.test.ts` confere todos os pares de CONTRAST_PAIRS
 * (WCAG 2.2 AA). Tema novo: entrada em THEMES + pasta do CSS no site.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * Tokens de cor (nomes herdados do tema "Álbum"; em outro tema o papel é o mesmo):
 * papel = fundo; areia = fundo alternado; branco = cartões; tinta = texto; marinho = superfície
 * escura (menu, contagem, rodapé); enfase = destaque/links sobre o fundo; suave = texto
 * secundário; serenity = acento decorativo (nunca texto sobre o fundo); claro = destaque sobre
 * a superfície escura; nevoa = texto secundário sobre a escura; erro / coral = erro sobre o
 * fundo / sobre a escura.
 */
export const PALETTE_TOKENS = [
  "papel",
  "areia",
  "branco",
  "tinta",
  "marinho",
  "enfase",
  "suave",
  "serenity",
  "claro",
  "nevoa",
  "erro",
  "coral",
] as const;
export type PaletteToken = (typeof PALETTE_TOKENS)[number];
export type PaletteColors = Record<PaletteToken, string>;

export const PaletteColors = z.object(
  Object.fromEntries(PALETTE_TOKENS.map((t) => [t, hex])) as Record<PaletteToken, typeof hex>,
);

/** Papel de um par: texto comum (4,5:1), texto grande (3:1) ou elemento de interface (3:1). */
export type PairKind = "texto" | "texto grande" | "interface";
export type ContrastPair = { fg: PaletteToken; bg: PaletteToken; role: string; kind: PairKind };

/** Todos os pares de cor que o site usa, por superfície (vale para qualquer tema). */
export const CONTRAST_PAIRS: ContrastPair[] = [
  ...(["papel", "areia", "branco"] as const).flatMap((bg): ContrastPair[] => [
    { fg: "tinta", bg, role: "Texto principal", kind: "texto" },
    { fg: "suave", bg, role: "Texto secundário, rótulos", kind: "texto" },
    { fg: "enfase", bg, role: "Palavra em itálico, links, foco", kind: "texto" },
    { fg: "erro", bg, role: "Erro", kind: "texto" },
    { fg: "suave", bg, role: "Borda de campo", kind: "interface" },
  ]),
  { fg: "branco", bg: "tinta", role: "Botão primário (branco sobre tinta)", kind: "texto" },
  { fg: "branco", bg: "marinho", role: "Texto principal", kind: "texto" },
  { fg: "nevoa", bg: "marinho", role: "Texto secundário, rótulos", kind: "texto" },
  { fg: "claro", bg: "marinho", role: "Palavra em itálico, segundos", kind: "texto" },
  { fg: "coral", bg: "marinho", role: "Erro", kind: "texto" },
  { fg: "serenity", bg: "marinho", role: "Anel de foco, borda de campo", kind: "interface" },
  { fg: "marinho", bg: "branco", role: "Botão primário (marinho sobre branco)", kind: "texto" },
];

/** Razão mínima da WCAG 2.2 AA para cada papel. */
export function minimumRatio(kind: PairKind): number {
  return kind === "texto" ? 4.5 : 3;
}

/** Pares que não passam na WCAG AA (vazio = paleta aprovada). */
export function paletteContrastIssues(colors: PaletteColors) {
  return CONTRAST_PAIRS.map((p) => ({ ...p, ratio: contrastRatio(colors[p.fg], colors[p.bg]) }))
    .filter((p) => p.ratio < minimumRatio(p.kind))
    .map(({ fg, bg, role, ratio }) => ({ fg, bg, role, ratio }));
}

/* ------------------------------------------------------------------------ */
/* Fontes                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Papéis de fonte: `text` = títulos e texto corrido (`--font-serif`), `ui` = rótulos, menu e
 * botões (`--font-sans`), `script` = nomes no topo e no rodapé (`--font-script`).
 */
export const FONT_ROLES = ["text", "ui", "script"] as const;
export type FontRole = (typeof FONT_ROLES)[number];

/** Lista curada (todas do Google Fonts, servidas pelo próprio site via next/font). */
export const FONTS = {
  "cormorant-garamond": { family: "Cormorant Garamond", roles: ["text"] },
  "playfair-display": { family: "Playfair Display", roles: ["text"] },
  fraunces: { family: "Fraunces", roles: ["text"] },
  "dm-serif-display": { family: "DM Serif Display", roles: ["text"] },
  outfit: { family: "Outfit", roles: ["text", "ui"] },
  jost: { family: "Jost", roles: ["ui"] },
  "nunito-sans": { family: "Nunito Sans", roles: ["ui"] },
  inter: { family: "Inter", roles: ["ui"] },
  "pinyon-script": { family: "Pinyon Script", roles: ["script"] },
  "great-vibes": { family: "Great Vibes", roles: ["script"] },
  "dancing-script": { family: "Dancing Script", roles: ["script"] },
} as const satisfies Record<string, { family: string; roles: readonly FontRole[] }>;
export type FontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as FontId[];

/** Sem fonte cursiva: os nomes saem na fonte de texto. */
export const NO_SCRIPT = "none";

/* ------------------------------------------------------------------------ */
/* Temas                                                                     */
/* ------------------------------------------------------------------------ */

export const THEME_IDS = ["album", "festa", "moderno"] as const;
export const ThemeId = z.enum(THEME_IDS);
export type ThemeId = z.infer<typeof ThemeId>;

export interface ThemePalette {
  id: string;
  name: string;
  colors: PaletteColors;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  description: string;
  /** A primeira é a padrão. */
  palettes: ThemePalette[];
  /** Fontes permitidas por papel; a primeira é a padrão. `script` aceita NO_SCRIPT. */
  fonts: { text: FontId[]; ui: FontId[]; script: (FontId | typeof NO_SCRIPT)[] };
}

/** Paleta do design "Álbum" (igual a apps/web/src/app/globals.css). */
export const ALBUM_MARINHO: PaletteColors = {
  papel: "#FAF7F1",
  areia: "#F1EEE6",
  branco: "#FFFFFF",
  tinta: "#1B2A4A",
  marinho: "#14213D",
  enfase: "#2D4675",
  suave: "#46557A",
  serenity: "#92A8D1",
  claro: "#BBD0EC",
  nevoa: "#D3DDED",
  erro: "#8A1F2B",
  coral: "#FFB3A7",
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  album: {
    id: "album",
    name: "Álbum",
    description: "Papel, tinta e polaroids com fita: clássico e afetivo.",
    palettes: [
      { id: "marinho", name: "Marinho e serenity", colors: ALBUM_MARINHO },
      {
        id: "terracota",
        name: "Terracota",
        colors: {
          papel: "#FBF7F2",
          areia: "#F3ECE3",
          branco: "#FFFFFF",
          tinta: "#3B2A22",
          marinho: "#4A2C21",
          enfase: "#8A4A32",
          suave: "#6A5448",
          serenity: "#D9A68C",
          claro: "#F2C7B0",
          nevoa: "#EADCD2",
          erro: "#8A1F2B",
          coral: "#FFB3A7",
        },
      },
    ],
    fonts: {
      text: ["cormorant-garamond", "playfair-display"],
      ui: ["jost", "nunito-sans"],
      script: ["pinyon-script", "great-vibes", NO_SCRIPT],
    },
  },
  festa: {
    id: "festa",
    name: "Festa",
    description: "Cores vivas e letras marcantes para 15 anos e aniversários.",
    palettes: [
      {
        id: "rosa",
        name: "Rosa e ameixa",
        colors: {
          papel: "#FFF8FB",
          areia: "#FBEEF4",
          branco: "#FFFFFF",
          tinta: "#3A1238",
          marinho: "#4B1446",
          enfase: "#9B2C6E",
          suave: "#6E4A68",
          serenity: "#F2A7CB",
          claro: "#F8C9DF",
          nevoa: "#EEDCEB",
          erro: "#A0182B",
          coral: "#FFB3A7",
        },
      },
      {
        id: "lilas",
        name: "Lilás",
        colors: {
          papel: "#FAF8FF",
          areia: "#F1EDFA",
          branco: "#FFFFFF",
          tinta: "#2A1F4A",
          marinho: "#2E1F5E",
          enfase: "#5B3FA8",
          suave: "#574C78",
          serenity: "#B9A6EC",
          claro: "#D3C6F5",
          nevoa: "#E2DCF3",
          erro: "#A0182B",
          coral: "#FFB3A7",
        },
      },
    ],
    fonts: {
      text: ["dm-serif-display", "playfair-display", "fraunces"],
      ui: ["nunito-sans", "jost"],
      script: ["great-vibes", "dancing-script", NO_SCRIPT],
    },
  },
  moderno: {
    id: "moderno",
    name: "Moderno",
    description: "Linhas limpas, muito respiro e tipografia sem serifa.",
    palettes: [
      {
        id: "grafite",
        name: "Grafite e verde-água",
        colors: {
          papel: "#F7F7F5",
          areia: "#EDEDEA",
          branco: "#FFFFFF",
          tinta: "#141414",
          marinho: "#1C1C1C",
          enfase: "#1F5F5B",
          suave: "#4A4A4A",
          serenity: "#7CC4BB",
          claro: "#A8DCD5",
          nevoa: "#D6D6D6",
          erro: "#9B1C1C",
          coral: "#FFB3A7",
        },
      },
      {
        id: "oceano",
        name: "Oceano",
        colors: {
          papel: "#F5F8FA",
          areia: "#E9EFF3",
          branco: "#FFFFFF",
          tinta: "#0F2230",
          marinho: "#0B2A3C",
          enfase: "#0F5F8A",
          suave: "#3F5868",
          serenity: "#6FB7D9",
          claro: "#A6D6EC",
          nevoa: "#D2E2EA",
          erro: "#9B1C1C",
          coral: "#FFB3A7",
        },
      },
    ],
    fonts: {
      text: ["outfit", "fraunces", "dm-serif-display"],
      ui: ["inter", "nunito-sans", "outfit"],
      script: [NO_SCRIPT, "dancing-script"],
    },
  },
};

/** Tema padrão por tipo de evento. */
export function defaultThemeFor(type: string): ThemeId {
  switch (eventTypeOf(type)) {
    case "wedding":
      return "album";
    case "fifteen":
    case "birthday":
    case "baby_shower":
      return "festa";
    default:
      return "moderno";
  }
}

/** `event_settings` › `site.theme` (público). Campos ausentes = padrão do tema. */
export const ThemeSelection = z
  .object({
    theme: ThemeId,
    palette: z.string().max(40).optional(),
    fonts: z
      .object({
        text: z.string().max(40).optional(),
        ui: z.string().max(40).optional(),
        script: z.string().max(40).optional(),
      })
      .optional(),
  })
  .superRefine((sel, ctx) => {
    const def = THEMES[sel.theme];
    if (sel.palette && !def.palettes.some((p) => p.id === sel.palette)) {
      ctx.addIssue({
        code: "custom",
        path: ["palette"],
        message: `Paleta "${sel.palette}" não existe no tema ${def.name}.`,
      });
    }
    for (const role of FONT_ROLES) {
      const f = sel.fonts?.[role];
      if (f && !(def.fonts[role] as string[]).includes(f)) {
        ctx.addIssue({
          code: "custom",
          path: ["fonts", role],
          message: `Fonte "${f}" não está disponível no tema ${def.name}.`,
        });
      }
    }
  });
export type ThemeSelection = z.infer<typeof ThemeSelection>;

/** Tema pronto para aplicar (vai em SiteContent.theme). */
export const ResolvedTheme = z.object({
  theme: ThemeId,
  palette: z.string(),
  colors: PaletteColors,
  fonts: z.object({ text: z.string(), ui: z.string(), script: z.string() }),
});
export type ResolvedTheme = z.infer<typeof ResolvedTheme>;

/** Escolha gravada (ou nenhuma) → tema completo; o que for inválido cai no padrão. */
export function resolveTheme(type: string, stored?: unknown): ResolvedTheme {
  const parsed = ThemeSelection.safeParse(stored);
  const sel: ThemeSelection = parsed.success ? parsed.data : { theme: defaultThemeFor(type) };
  const def = THEMES[sel.theme];
  const palette = def.palettes.find((p) => p.id === sel.palette) ?? def.palettes[0]!;
  return {
    theme: def.id,
    palette: palette.id,
    colors: palette.colors,
    fonts: {
      text: sel.fonts?.text ?? def.fonts.text[0]!,
      ui: sel.fonts?.ui ?? def.fonts.ui[0]!,
      script: sel.fonts?.script ?? def.fonts.script[0]!,
    },
  };
}
