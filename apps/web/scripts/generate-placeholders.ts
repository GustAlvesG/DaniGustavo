/**
 * Gera os placeholders de imagem (docs/PROMPT.md §2) em public/placeholder/:
 * campo marinho com padrão de azulejo em linha branca e uma "janela" clara
 * (relevo, linha royal) com a forma dos cartões do casal: arco nas fotos em
 * pé, cápsula nas deitadas, círculo nas quadradas. Sem fotos, sem texto.
 *
 * Uso (de apps/web): node scripts/generate-placeholders.ts
 * O Node 24 roda .ts direto; os desenhos vêm dos dados puros dos azulejos.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type * as Designs from "../src/components/tiles/designs";

const designsUrl = new URL("../src/components/tiles/designs.ts", import.meta.url);
const { tileMarkup, TILE_COLORS } = (await import(designsUrl.href)) as typeof Designs;

type Design = Designs.TileDesign;
type Rot = 0 | 90 | 180 | 270;

interface Spec {
  file: string;
  w: number;
  h: number;
  /** Desenho do fundo (padrão em roseta). */
  bg: Design;
  /** Tamanho do ladrilho do fundo, em px do viewBox. */
  tile: number;
  /**
   * Janela clara (arco, cápsula ou círculo) com um bloco 2×2 do desenho (o motivo inteiro; o
   * monograma vai sozinho): posição (0–1) e lado (fração da menor medida).
   */
  win?: { design: Design; x: number; y: number; size: number; rotate?: Rot };
  /** Desloca o padrão (em ladrilhos) para variar o recorte. */
  shift?: [number, number];
}

const ROSETA: [Rot, Rot][] = [
  [0, 90],
  [270, 180],
];

function svg(spec: Spec): string {
  const { w, h, bg, tile: t, win, shift = [0, 0] } = spec;
  const block = t * 2;
  // Bloco 2×2 em roseta: o motivo inteiro, como no azulejo de verdade.
  const blockUses = (href: string, x0: number, y0: number, size: number, rotate: Rot = 0) =>
    ROSETA.flatMap((line, r) =>
      line.map((rot, c) => {
        const x = x0 + c * size;
        const y = y0 + r * size;
        const deg = (rot + rotate) % 360;
        return `<use href="#${href}" x="${x}" y="${y}" width="${size}" height="${size}"${
          deg ? ` transform="rotate(${deg} ${x + size / 2} ${y + size / 2})"` : ""
        }/>`;
      }),
    ).join("");
  const uses = blockUses("bg", 0, 0, t);
  // Um símbolo por desenho: o fundo em linha branca, a janela em royal.
  const bgSymbol = `<symbol id="bg" viewBox="0 0 100 100">${tileMarkup(bg, { washOpacity: 0.14 })}</symbol>`;
  let windowMarkup = "";
  let windowSymbol = "";
  if (win) {
    const side = Math.round(Math.min(w, h) * win.size);
    const x = Math.round((w - side) * win.x);
    const y = Math.round((h - side) * win.y);
    const pad = Math.round(side * 0.06);
    windowSymbol = `<symbol id="win" viewBox="0 0 100 100">${tileMarkup(win.design, {
      ink: TILE_COLORS.royal,
      inkSecondary: TILE_COLORS.serenity,
      washOpacity: 0.22,
    })}</symbol>`;
    // Forma da janela pela proporção da imagem.
    const X = x - pad;
    const Y = y - pad;
    const S = side + pad * 2;
    const shape =
      h > w * 1.05
        ? `M${X} ${Y + S}V${Y + S / 2}A${S / 2} ${S / 2} 0 0 1 ${X + S} ${Y + S / 2}V${Y + S}Z`
        : w > h * 1.05
          ? `M${X + S / 4} ${Y + S / 4}H${X + (S * 3) / 4}A${S / 4} ${S / 4} 0 0 1 ${X + (S * 3) / 4} ${Y + (S * 3) / 4}H${X + S / 4}A${S / 4} ${S / 4} 0 0 1 ${X + S / 4} ${Y + S / 4}Z`
          : `M${X} ${Y + S / 2}A${S / 2} ${S / 2} 0 1 1 ${X + S} ${Y + S / 2}A${S / 2} ${S / 2} 0 1 1 ${X} ${Y + S / 2}Z`;
    const ring = Math.max(6, Math.round(S * 0.022));
    const content =
      win.design === "monograma"
        ? `<use href="#win" x="${x}" y="${y}" width="${side}" height="${side}"/>`
        : blockUses("win", x, y, side / 2, win.rotate ?? 0);
    windowMarkup =
      `<clipPath id="c"><path d="${shape}"/></clipPath>` +
      `<path d="${shape}" fill="${TILE_COLORS.relevo}"/>` +
      `<g clip-path="url(#c)">${content}</g>` +
      `<path d="${shape}" fill="none" stroke="${TILE_COLORS.royal}" stroke-width="${ring * 2}" clip-path="url(#c)"/>` +
      `<path d="${shape}" fill="none" stroke="${TILE_COLORS.serenity}" stroke-opacity=".6" stroke-width="2" transform="translate(0 0)"/>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs>${bgSymbol}${windowSymbol}` +
    `<pattern id="p" width="${block}" height="${block}" patternUnits="userSpaceOnUse" x="${-shift[0] * t}" y="${-shift[1] * t}">${uses}</pattern></defs>` +
    `<rect width="${w}" height="${h}" fill="${TILE_COLORS.marinho}"/>` +
    `<rect width="${w}" height="${h}" fill="url(#p)" opacity=".42"/>` +
    windowMarkup +
    `</svg>
`
  );
}

const P = 1000;
const portrait = { w: 800, h: 1000 }; // 4:5
const wide = { w: 1200, h: 800 }; // 3:2

const specs: Spec[] = [
  // Casal (hero), retrato 4:5.
  {
    file: "hero.svg",
    ...portrait,
    bg: "ramo",
    tile: 200,
    win: { design: "monograma", x: 0.5, y: 0.42, size: 0.5 },
  },
  // Nossa história: momentos alternando 4:5 e 3:2.
  {
    file: "historia-1.svg",
    ...portrait,
    bg: "flor",
    tile: 160,
    win: { design: "flor", x: 0.5, y: 0.5, size: 0.56 },
  },
  {
    file: "historia-2.svg",
    ...wide,
    bg: "onda",
    tile: 200,
    win: { design: "onda", x: 0.22, y: 0.5, size: 0.52 },
    shift: [1, 0],
  },
  {
    file: "historia-3.svg",
    ...portrait,
    bg: "trama",
    tile: 200,
    win: { design: "estrela", x: 0.5, y: 0.3, size: 0.5 },
  },
  {
    file: "historia-4.svg",
    ...wide,
    bg: "moldura",
    tile: 200,
    win: { design: "laco", x: 0.78, y: 0.5, size: 0.5 },
  },
  {
    file: "historia-5.svg",
    ...portrait,
    bg: "estrela",
    tile: 133,
    win: { design: "ramo", x: 0.5, y: 0.66, size: 0.54 },
    shift: [1, 1],
  },
  {
    file: "historia-6.svg",
    ...wide,
    bg: "laco",
    tile: 200,
    win: { design: "trama", x: 0.5, y: 0.5, size: 0.5 },
  },
  // Galeria: proporções variadas (3:4, 1:1, 4:3).
  {
    file: "galeria-1.svg",
    w: 900,
    h: 1200,
    bg: "flor",
    tile: 150,
    win: { design: "moldura", x: 0.5, y: 0.5, size: 0.6, rotate: 0 },
  },
  { file: "galeria-2.svg", w: P, h: P, bg: "onda", tile: 250 },
  {
    file: "galeria-3.svg",
    w: 1200,
    h: 900,
    bg: "ramo",
    tile: 150,
    win: { design: "estrela", x: 0.3, y: 0.5, size: 0.5 },
  },
  { file: "galeria-4.svg", w: 900, h: 1200, bg: "estrela", tile: 225, shift: [1, 0] },
  {
    file: "galeria-5.svg",
    w: P,
    h: P,
    bg: "trama",
    tile: 125,
    win: { design: "onda", x: 0.5, y: 0.5, size: 0.44, rotate: 180 },
  },
  { file: "galeria-6.svg", w: 1200, h: 900, bg: "laco", tile: 225, shift: [0, 1] },
  {
    file: "galeria-7.svg",
    w: 900,
    h: 1200,
    bg: "moldura",
    tile: 225,
    win: { design: "estrela", x: 0.5, y: 0.5, size: 0.5 },
  },
  { file: "galeria-8.svg", w: P, h: P, bg: "flor", tile: 250, shift: [1, 1] },
  // Presente, 1:1.
  {
    file: "presente.svg",
    w: P,
    h: P,
    bg: "moldura",
    tile: 250,
    win: { design: "laco", x: 0.5, y: 0.5, size: 0.5 },
  },
];

const outDir = new URL("../public/placeholder/", import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const spec of specs) {
  const out = svg(spec);
  writeFileSync(new URL(spec.file, outDir), out);
  console.log(
    `${spec.file.padEnd(16)} ${spec.w}×${spec.h}  ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB`,
  );
}
