/*
 * Gerador de QR Code próprio (sem dependência): modo byte (UTF-8), correção de erro M
 * (~15%), versão escolhida automaticamente (1 a 40) e máscara pela menor penalidade.
 * Segue a ISO/IEC 18004; a estrutura (Reed-Solomon, intercalação, posições) é a mesma do
 * gerador de referência de Nayuki. Saída em matriz ou SVG (para o painel imprimir).
 */

/** Codewords de correção por bloco, nível M, por versão (índice = versão). */
const ECC_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
/** Número de blocos de correção, nível M, por versão. */
const BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
  26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];
/** Bits do nível M no formato (L=01, M=00, Q=11, H=10). */
const ECC_FORMAT_M = 0;

export interface QrCode {
  version: number;
  /** Lado da matriz em módulos (sem a margem). */
  size: number;
  mask: number;
  /** modules[linha][coluna]: true = escuro. */
  modules: boolean[][];
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

/** Módulos disponíveis para dados+correção (tudo menos padrões de função). */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Codewords de dados (sem correção) que cabem na versão, nível M. */
export function dataCodewords(version: number): number {
  return (
    Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK_M[version]! * BLOCKS_M[version]!
  );
}

/** Centros dos padrões de alinhamento da versão. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const size = version * 4 + 17;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/* ------------------------------------------------------------------ Reed-Solomon (GF 256) */

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < degree) result[j] ^= result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Codewords de correção (resto da divisão polinomial). */
export function rsRemainder(data: readonly number[], degree: number): number[] {
  const divisor = rsDivisor(degree);
  const result = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

/* ------------------------------------------------------------------ formato e versão */

/** 15 bits de formato (nível M + máscara), já com a máscara 0x5412. */
export function formatBits(mask: number): number {
  const data = (ECC_FORMAT_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 bits de versão (só versões 7+). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/* ------------------------------------------------------------------ dados */

function encodeData(bytes: Uint8Array, version: number): number[] {
  const capacity = dataCodewords(version) * 8;
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // modo byte
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity - bits.length)); // terminador
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]!;
    out.push(b);
  }
  return out;
}

/** Divide em blocos, calcula a correção de cada um e intercala (ordem de gravação). */
export function interleave(data: readonly number[], version: number): number[] {
  const blocks = BLOCKS_M[version]!;
  const eccLen = ECC_PER_BLOCK_M[version]!;
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, eccLen);
    if (i < shortBlocks) dat.push(0);
    all.push([...dat, ...ecc]);
  }
  const result: number[] = [];
  for (let i = 0; i < all[0]!.length; i++) {
    all.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= shortBlocks) result.push(block[i]!);
    });
  }
  return result;
}

/* ------------------------------------------------------------------ matriz */

type Grid = boolean[][];

function functionPatterns(version: number) {
  const size = version * 4 + 17;
  const modules: Grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: Grid = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const set = (x: number, y: number, dark: boolean) => {
    modules[y]![x] = dark;
    isFunction[y]![x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const align = alignmentPositions(version);
  const last = align.length - 1;
  align.forEach((ax, i) =>
    align.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }),
  );
  drawFormat(modules, isFunction, 0);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(bits, i));
      set(b, a, bit(bits, i));
    }
  }
  return { size, modules, isFunction };
}

function drawFormat(modules: Grid, isFunction: Grid, mask: number) {
  const size = modules.length;
  const bits = formatBits(mask);
  const set = (x: number, y: number, dark: boolean) => {
    modules[y]![x] = dark;
    isFunction[y]![x] = true;
  };
  for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
  set(8, 7, bit(bits, 6));
  set(8, 8, bit(bits, 7));
  set(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
  set(8, size - 8, true); // módulo escuro fixo
}

/** Percorre as colunas em zigue-zague (pares, de baixo para cima e volta). */
export function codewordPositions(isFunction: Grid): [number, number][] {
  const size = isFunction.length;
  const out: [number, number][] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y]![x]) out.push([x, y]);
      }
    }
  }
  return out;
}

/** Condição de cada máscara (x = coluna, y = linha). */
export function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Penalidade da ISO 18004 (regras N1 a N4); menor é melhor. */
export function penalty(modules: Grid): number {
  const size = modules.length;
  let score = 0;
  const lines: boolean[][] = [];
  for (let i = 0; i < size; i++) {
    lines.push(modules[i]!);
    lines.push(modules.map((row) => row[i]!));
  }
  const finderLike = [true, false, true, true, true, false, true];
  for (const line of lines) {
    // N1: 5+ módulos iguais seguidos.
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // N3: 1:1:3:1:1 com 4 claros de um dos lados (fora da matriz conta como claro).
    const at = (i: number) => (i >= 0 && i < size ? line[i]! : false);
    for (let i = 0; i + 7 <= size; i++) {
      if (!finderLike.every((v, k) => at(i + k) === v)) continue;
      const before = [1, 2, 3, 4].every((k) => !at(i - k));
      const after = [7, 8, 9, 10].every((k) => !at(i + k));
      if (before) score += 40;
      if (after) score += 40;
    }
  }
  // N2: blocos 2x2 da mesma cor.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y]![x];
      if (c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) {
        score += 3;
      }
    }
  }
  // N4: proporção de escuros longe de 50%.
  const dark = modules.reduce((n, row) => n + row.filter(Boolean).length, 0);
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** Menor versão (1 a 40) em que `byteLength` bytes cabem, nível M. */
export function chooseVersion(byteLength: number, minVersion = 1): number {
  for (let v = Math.max(1, minVersion); v <= 40; v++) {
    const header = 4 + (v <= 9 ? 8 : 16);
    if (header + byteLength * 8 <= dataCodewords(v) * 8) return v;
  }
  throw new Error("Texto longo demais para um QR Code.");
}

/** Gera o QR Code de um texto (UTF-8). `mask` força uma máscara (testes). */
export function qrEncode(text: string, opts: { minVersion?: number; mask?: number } = {}): QrCode {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length, opts.minVersion);
  const codewords = interleave(encodeData(bytes, version), version);
  const { size, modules, isFunction } = functionPatterns(version);
  const positions = codewordPositions(isFunction);
  positions.forEach(([x, y], i) => {
    const byte = codewords[i >>> 3];
    // Sobra de 0 a 7 módulos ("remainder bits") fica clara antes da máscara.
    modules[y]![x] = byte === undefined ? false : bit(byte, 7 - (i & 7));
  });

  const withMask = (mask: number) => {
    const grid = modules.map((row) => row.slice());
    const fn = isFunction.map((row) => row.slice());
    for (const [x, y] of positions) if (maskApplies(mask, x, y)) grid[y]![x] = !grid[y]![x];
    drawFormat(grid, fn, mask);
    return grid;
  };

  let best = { mask: 0, grid: withMask(0), score: Infinity };
  for (let mask = 0; mask < 8; mask++) {
    if (opts.mask !== undefined && mask !== opts.mask) continue;
    const grid = withMask(mask);
    const score = penalty(grid);
    if (score < best.score) best = { mask, grid, score };
  }
  return { version, size, mask: best.mask, modules: best.grid };
}

/**
 * SVG do QR (um único <path>, escala por viewBox). `margin` é a zona de silêncio em
 * módulos (o padrão pede 4). Cor escura e clara configuráveis para o visual do convite.
 */
export function qrSvg(
  text: string,
  opts: { margin?: number; dark?: string; light?: string; title?: string } = {},
): string {
  const { size, modules } = qrEncode(text);
  const margin = opts.margin ?? 4;
  const full = size + margin * 2;
  let d = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    }),
  );
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const title = opts.title ? `<title>${esc(opts.title)}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" ` +
    `shape-rendering="crispEdges" role="img"${opts.title ? ` aria-label="${esc(opts.title)}"` : ""}>` +
    title +
    `<rect width="${full}" height="${full}" fill="${opts.light ?? "#fff"}"/>` +
    `<path d="${d}" fill="${opts.dark ?? "#000"}"/></svg>`
  );
}
