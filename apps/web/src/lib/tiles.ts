/**
 * Utilitários puros do sistema de azulejos (sem React, sem DOM).
 *
 * Padrões são matrizes de rotação repetidas pela grade. Para os desenhos
 * simétricos na diagonal (todos menos o monograma), `roseta` e `inversa`
 * fecham as junções entre ladrilhos; `reto` só repete.
 */
export { TILE_DESIGNS, isTileDesign, type TileDesign } from "@/components/tiles/designs";

export type TileRotation = 0 | 90 | 180 | 270;

export type TilePatternName = "roseta" | "inversa" | "reto";

/** Nome de padrão ou matriz própria (linhas × colunas, repetida). */
export type TilePattern = TilePatternName | readonly (readonly TileRotation[])[];

export const TILE_PATTERNS: Readonly<
  Record<TilePatternName, readonly (readonly TileRotation[])[]>
> = {
  // O canto inferior direito do desenho vira o centro de cada bloco 2×2.
  roseta: [
    [0, 90],
    [270, 180],
  ],
  // O canto superior esquerdo vira o centro do bloco (roseta deslocada).
  inversa: [
    [180, 270],
    [90, 0],
  ],
  reto: [[0]],
};

/** Ajusta qualquer ângulo ao múltiplo de 90° mais próximo, em 0–270. */
export function normalizeRotation(deg: number): TileRotation {
  if (!Number.isFinite(deg)) return 0;
  const q = Math.round(deg / 90);
  return ((((q % 4) + 4) % 4) * 90) as TileRotation;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Rotação do ladrilho na coluna `col` e linha `row` (aceita negativos). */
export function rotationFor(pattern: TilePattern, col: number, row: number): TileRotation {
  const matrix = typeof pattern === "string" ? TILE_PATTERNS[pattern] : pattern;
  if (!matrix.length || !matrix[0]?.length) return 0;
  const line = matrix[mod(Math.trunc(row), matrix.length)];
  if (!line.length) return 0;
  return normalizeRotation(line[mod(Math.trunc(col), line.length)]);
}

/** Uma linha de rotações (para faixas). */
export function rotationsForRow(pattern: TilePattern, count: number, row = 0): TileRotation[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, col) =>
    rotationFor(pattern, col, row),
  );
}

/**
 * Atraso de cada ladrilho para uma onda que nasce no centro da grade
 * (abertura). Distância euclidiana ao centro × `stepMs`, com o ladrilho mais
 * central em 0. Retorna em ordem de linhas (índice = row * cols + col).
 */
export function staggerFromCenter(
  cols: number,
  rows: number,
  opts: { stepMs?: number; originCol?: number; originRow?: number } = {},
): number[] {
  const c = Math.max(0, Math.floor(cols));
  const r = Math.max(0, Math.floor(rows));
  const { stepMs = 60, originCol = (c - 1) / 2, originRow = (r - 1) / 2 } = opts;
  const dists: number[] = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      dists.push(Math.hypot(col - originCol, row - originRow));
    }
  }
  if (!dists.length) return [];
  const min = Math.min(...dists);
  return dists.map((d) => Math.round((d - min) * stepMs));
}

/** Maior atraso de uma lista (para somar a duração total de uma onda). */
export function maxDelay(delays: readonly number[]): number {
  return delays.reduce((m, d) => (d > m ? d : m), 0);
}

/**
 * Desenho de um bloco quando a grade mistura vários: cada bloco 2×2 usa um
 * desenho inteiro, para os motivos continuarem fechando.
 */
export function designForCell<T>(designs: readonly T[], col: number, row: number): T {
  if (!designs.length) throw new Error("designForCell: lista de desenhos vazia");
  const block = Math.floor(col / 2) + Math.floor(row / 2);
  return designs[mod(block, designs.length)];
}
