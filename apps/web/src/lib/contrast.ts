/**
 * Contraste de cores segundo a WCAG 2.2 (luminância relativa).
 * Puro, sem DOM: usado pela prancha /dev/design e por testes.
 */

export type ContrastLevel = "AAA" | "AA" | "AA grande" | "falha";

/** "#1F3FAE" ou "#fff" -> [r, g, b] em 0–255. */
export function parseHex(hex: string): [number, number, number] {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`Cor inválida: ${hex}`);
  }
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa (0 = preto, 1 = branco). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste entre duas cores, de 1 a 21 (a ordem não importa). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Nível WCAG para texto: AAA (7:1), AA (4,5:1), AA grande (3:1, texto a
 * partir de 24px ou 18,66px em negrito e componentes de interface).
 */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA grande";
  return "falha";
}

const THRESHOLDS = [3, 4.5, 7];

/**
 * "8,6:1" em pt-BR, com uma casa. Se o arredondamento esconder que a razão
 * fica abaixo de um limite da WCAG (4,477 viraria "4,5"), mostra duas casas
 * ("4,48:1"), para o número nunca prometer mais do que a cor entrega.
 */
export function formatRatio(ratio: number): string {
  const oneDecimal = Math.round(ratio * 10) / 10;
  const misleading = THRESHOLDS.some((t) => ratio < t && oneDecimal >= t);
  const digits = misleading ? 2 : 1;
  const shown = misleading ? Math.floor(ratio * 100) / 100 : oneDecimal;
  const text = shown.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${text}:1`;
}
