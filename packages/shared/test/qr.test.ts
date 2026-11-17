import { describe, expect, it } from "vitest";
import {
  alignmentPositions,
  chooseVersion,
  dataCodewords,
  formatBits,
  qrEncode,
  qrSvg,
  rsRemainder,
  versionBits,
} from "../src/qr.ts";

/*
 * O gerador é conferido de três jeitos: vetores conhecidos da norma (tabelas de formato,
 * versão, alinhamento, capacidade e o exemplo "HELLO WORLD" 1-M de Reed-Solomon), a
 * estrutura da matriz (localizadores, temporização, módulo escuro) e um decodificador
 * escrito aqui, de forma independente, que lê a matriz, confere a correção de erro pelas
 * síndromes e devolve o texto.
 */

// Tabela de formato da ISO 18004 para o nível M, máscaras 0 a 7.
const FORMAT_M = [
  "101010000010010",
  "101000100100101",
  "101111001111100",
  "101101101001011",
  "100010111111001",
  "100000011001110",
  "100111110010111",
  "100101010100000",
];

describe("vetores da norma", () => {
  it("bits de formato do nível M", () => {
    FORMAT_M.forEach((bits, mask) => {
      expect(formatBits(mask).toString(2).padStart(15, "0")).toBe(bits);
    });
  });

  it("bits de versão", () => {
    expect(versionBits(7)).toBe(0x07c94);
    expect(versionBits(10)).toBe(0x0a4d3);
    expect(versionBits(40)).toBe(0x28c69);
  });

  it("posições dos padrões de alinhamento", () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
    expect(alignmentPositions(15)).toEqual([6, 26, 48, 70]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentPositions(36)).toEqual([6, 24, 50, 76, 102, 128, 154]);
  });

  it("capacidade em bytes do nível M (versões 1 a 10)", () => {
    const bytes = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
    bytes.forEach((n, i) => {
      const v = i + 1;
      expect(chooseVersion(n)).toBe(v);
      if (v < 10) expect(chooseVersion(n + 1)).toBe(v + 1);
    });
    expect(dataCodewords(1)).toBe(16);
    expect(dataCodewords(10)).toBe(216);
  });

  it("Reed-Solomon do exemplo HELLO WORLD 1-M", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
});

/* ------------------------------------------------------------------ decodificador */

const EXP: number[] = [];
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP.push(x);
    x = x & 0x80 ? ((x << 1) ^ 0x11d) & 0xff : x << 1;
  }
}
const LOG = new Array<number>(256).fill(0);
EXP.forEach((v, i) => (LOG[v] = i));
const mul = (a: number, b: number) => (a && b ? EXP[(LOG[a]! + LOG[b]!) % 255]! : 0);

/** Síndromes nulas ⇔ o bloco é uma palavra-código válida. */
function syndromesZero(block: number[], ecc: number): boolean {
  for (let i = 0; i < ecc; i++) {
    let s = 0;
    for (const c of block) s = mul(s, EXP[i]!) ^ c;
    if (s !== 0) return false;
  }
  return true;
}

const ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Decodifica uma matriz versão 1–10, nível M, modo byte. */
function decode(m: boolean[][]): { text: string; mask: number; version: number } {
  const n = m.length;
  const version = (n - 17) / 4;
  const at = (r: number, c: number) => (m[r]![c] ? 1 : 0);
  // Formato, cópia 1: coluna 8 (linhas 0-5, 7, 8) e linha 8 (colunas 7, 5..0); MSB primeiro.
  const cells1: [number, number][] = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ];
  let f1 = 0;
  cells1.forEach(([r, c], i) => (f1 |= at(r, c) << (14 - i)));
  // Cópia 2: bits 0-7 na linha 8 da direita para a esquerda; 8-14 na coluna 8, de n-7 para baixo.
  let f2 = 0;
  for (let i = 0; i < 8; i++) f2 |= at(8, n - 1 - i) << i;
  for (let i = 0; i < 7; i++) f2 |= at(n - 7 + i, 8) << (8 + i);
  if (f1 !== f2) throw new Error("cópias do formato divergem");
  const fmt = f1.toString(2).padStart(15, "0");
  const mask = FORMAT_M.indexOf(fmt);
  if (mask < 0) throw new Error(`formato inválido ${fmt}`);
  if (at(n - 8, 8) !== 1) throw new Error("sem módulo escuro");

  // Áreas reservadas (não são dados).
  const reserved = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const box = (r0: number, c0: number, h: number, w: number) => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) reserved[r]![c] = true;
  };
  box(0, 0, 9, 9);
  box(0, n - 8, 9, 8);
  box(n - 8, 0, 8, 9);
  box(6, 0, 1, n);
  box(0, 6, n, 1);
  if (version >= 7) {
    box(0, n - 11, 6, 3);
    box(n - 11, 0, 3, 6);
  }
  const centers = version === 1 ? [] : version < 7 ? [6, 4 * version + 10] : [];
  if (version >= 7) {
    // versões 7 a 10: três centros (6, meio, n-7).
    const mid = { 7: 22, 8: 24, 9: 26, 10: 28 }[version]!;
    centers.push(6, mid, n - 7);
  }
  const last = centers.length - 1;
  centers.forEach((r, i) =>
    centers.forEach((c, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      box(r - 2, c - 2, 5, 5);
    }),
  );

  // Lê os bits em pares de colunas, da direita para a esquerda, subindo e descendo.
  const bits: number[] = [];
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < n; k++) {
      const r = up ? n - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (reserved[r]![c]) continue;
        bits.push(at(r, c) ^ (MASKS[mask]!(r, c) ? 1 : 0));
      }
    }
    up = !up;
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }

  // Desfaz a intercalação e confere cada bloco.
  const blocks = BLOCKS[version]!;
  const ecc = ECC_M[version]!;
  const total = bytes.length;
  const shortLen = Math.floor(total / blocks);
  const longCount = total % blocks;
  const dataLens = Array.from(
    { length: blocks },
    (_, i) => shortLen - ecc + (i >= blocks - longCount ? 1 : 0),
  );
  const split: number[][] = dataLens.map(() => []);
  let p = 0;
  const maxData = Math.max(...dataLens);
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < blocks; b++) if (i < dataLens[b]!) split[b]!.push(bytes[p++]!);
  }
  for (let i = 0; i < ecc; i++) for (let b = 0; b < blocks; b++) split[b]!.push(bytes[p++]!);
  const data: number[] = [];
  split.forEach((block, b) => {
    if (!syndromesZero(block, ecc)) throw new Error(`bloco ${b} com erro`);
    data.push(...block.slice(0, dataLens[b]));
  });

  // Modo byte: 0100, contagem (8 bits até a versão 9, 16 depois), bytes.
  const stream = data.flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1));
  const read = (from: number, len: number) =>
    stream.slice(from, from + len).reduce((a, b) => (a << 1) | b, 0);
  if (read(0, 4) !== 0b0100) throw new Error("modo não é byte");
  const countBits = version <= 9 ? 8 : 16;
  const count = read(4, countBits);
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = read(4 + countBits + i * 8, 8);
  return { text: new TextDecoder().decode(out), mask, version };
}

/* ------------------------------------------------------------------ testes */

const SAMPLES = [
  "A",
  "https://danieguga.com.br/c/01JH5Z8Q4M7N2P3R6S9T0V1W2X",
  "http://localhost:3000/c/01KAB0C1D2E3F4G5H6J7K8M9NP",
  "Dani & Gustavo — 10/04/2027, Solare Roma. Confirme pelo link! ção ü 日本",
  "x".repeat(84),
  "y".repeat(85),
  "z".repeat(122),
  "w".repeat(200),
];

function finderOk(m: boolean[][], r0: number, c0: number) {
  for (let dr = 0; dr < 7; dr++) {
    for (let dc = 0; dc < 7; dc++) {
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      expect(m[r0 + dr]![c0 + dc], `localizador ${r0},${c0} [${dr},${dc}]`).toBe(ring !== 2);
    }
  }
}

describe("qrEncode", () => {
  it.each(SAMPLES)("decodifica de volta: %s", (text) => {
    const qr = qrEncode(text);
    expect(qr.size).toBe(qr.version * 4 + 17);
    const back = decode(qr.modules);
    expect(back.text).toBe(text);
    expect(back.mask).toBe(qr.mask);
    expect(back.version).toBe(qr.version);
  });

  it("decodifica com todas as máscaras e várias versões", () => {
    for (let mask = 0; mask < 8; mask++) {
      for (const minVersion of [1, 2, 5, 7, 9, 10]) {
        const qr = qrEncode("Oi!", { mask, minVersion });
        expect(qr.version).toBe(minVersion);
        expect(decode(qr.modules)).toEqual({ text: "Oi!", mask, version: minVersion });
      }
    }
  });

  it("estrutura: localizadores, separadores, temporização e módulo escuro", () => {
    const { modules: m, size: n } = qrEncode(SAMPLES[1]!);
    finderOk(m, 0, 0);
    finderOk(m, 0, n - 7);
    finderOk(m, n - 7, 0);
    for (let i = 0; i < 8; i++) {
      expect(m[7]![i]).toBe(false);
      expect(m[i]![7]).toBe(false);
      expect(m[7]![n - 1 - i]).toBe(false);
      expect(m[n - 8]![i]).toBe(false);
    }
    for (let i = 8; i < n - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8]![8]).toBe(true);
  });

  it("um link de convite cabe na versão 4 ou menos (impressão nítida)", () => {
    const qr = qrEncode("https://www.daniegustavo.com.br/c/01JH5Z8Q4M7N2P3R6S9T0V1W2X");
    expect(qr.version).toBeLessThanOrEqual(4);
  });

  it("recusa texto grande demais", () => {
    expect(() => qrEncode("a".repeat(3000))).toThrow(/longo demais/);
  });
});

describe("qrSvg", () => {
  it("gera um SVG com zona de silêncio e título escapado", () => {
    const svg = qrSvg("oi", { title: 'QR "A & B"', dark: "#14213d" });
    const qr = qrEncode("oi");
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
    expect(svg).toContain("<title>QR &quot;A &amp; B&quot;</title>");
    expect(svg).toContain('fill="#14213d"');
    const dark = qr.modules.flat().filter(Boolean).length;
    expect(svg.match(/h1v1h-1z/g)).toHaveLength(dark);
  });
});
