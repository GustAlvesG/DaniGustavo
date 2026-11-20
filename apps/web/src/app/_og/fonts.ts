import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedTheme } from "@casamento/shared";

/*
 * Fontes da imagem de prévia (Satori só lê TTF/OTF estático, não woff2 nem variável; as fontes
 * do site vão pelo next/font). Cada fonte de nome com TTF aqui (OFL, do Google Fonts) é usada
 * quando o tema a escolhe; as demais (variáveis) caem na Jost, que é sem serifa e combina.
 */
const dir = join(process.cwd(), "src", "app", "_og");

const FILES: Record<string, string> = {
  "pinyon-script": "PinyonScript-Regular.ttf",
  "great-vibes": "GreatVibes-Regular.ttf",
  "dm-serif-display": "DMSerifDisplay-Regular.ttf",
};
const UI_FILE = "Jost-Medium.ttf";

export type OgFonts = {
  /** Fonte dos nomes: cursiva (grande) ou a de texto do tema (menor). */
  names: { data: Buffer; script: boolean };
  ui: Buffer;
};

export async function ogFonts(theme: ResolvedTheme): Promise<OgFonts> {
  const script = FILES[theme.fonts.script];
  const text = FILES[theme.fonts.text];
  const file = script ?? text ?? UI_FILE;
  const [names, ui] = await Promise.all([readFile(join(dir, file)), readFile(join(dir, UI_FILE))]);
  return { names: { data: names, script: Boolean(script) }, ui };
}
