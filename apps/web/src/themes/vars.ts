import {
  FONTS,
  NO_SCRIPT,
  PALETTE_TOKENS,
  type FontId,
  type FontRole,
  type ResolvedTheme,
} from "@casamento/shared";

/*
 * Tema do evento → variáveis CSS (puro, testável). O layout `[host]` põe o resultado no `style`
 * do <html>: as cores sobrescrevem as de globals.css (`--color-<token>`, as do Álbum) e as
 * fontes entram em `--tema-texto`/`--tema-ui`/`--tema-script`, que `@theme inline` liga a
 * `font-serif`/`font-sans`/`font-script`. Sem escolha, o evento usa o tema do tipo.
 */

/** Variável CSS que o next/font de cada fonte define (themes/fonts.ts). */
export const fontVar = (id: FontId) => `--font-${id}`;

const FALLBACK: Record<FontRole, string> = {
  text: 'Georgia, "Times New Roman", serif',
  ui: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
  script: "cursive",
};

/** Pilha de fontes de um papel (`none` no script = a fonte de texto). */
export function fontStack(role: FontRole, id: string, textId?: string): string {
  if (role === "script" && id === NO_SCRIPT) return fontStack("text", textId ?? id);
  const font = FONTS[id as FontId];
  if (!font) return FALLBACK[role];
  return `var(${fontVar(id as FontId)}), "${font.family}", ${FALLBACK[role]}`;
}

/** Variáveis do <html>: cores do tema e as três pilhas de fontes. */
export function themeVars(theme: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const token of PALETTE_TOKENS) vars[`--color-${token}`] = theme.colors[token];
  vars["--tema-texto"] = fontStack("text", theme.fonts.text);
  vars["--tema-ui"] = fontStack("ui", theme.fonts.ui);
  vars["--tema-script"] = fontStack("script", theme.fonts.script, theme.fonts.text);
  return vars;
}

/** Ids das fontes em uso (as classes `variable` do next/font entram só para elas). */
export function themeFontIds(theme: ResolvedTheme): FontId[] {
  const ids = [theme.fonts.text, theme.fonts.ui, theme.fonts.script].filter(
    (id): id is FontId => id in FONTS,
  );
  return [...new Set(ids)];
}

/** Cor da barra do navegador (menu) e do fundo do app instalável. */
export const themeColors = (theme: ResolvedTheme) => ({
  bar: theme.colors.marinho,
  background: theme.colors.papel,
});
