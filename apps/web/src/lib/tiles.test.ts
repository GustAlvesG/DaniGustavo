import { describe, expect, it } from "vitest";
import {
  TILE_DESIGNS,
  designForCell,
  isTileDesign,
  maxDelay,
  normalizeRotation,
  rotationFor,
  rotationsForRow,
  staggerFromCenter,
} from "./tiles";
import { MONOGRAM_ART, TILE_ART } from "@/components/tiles/designs";

describe("isTileDesign", () => {
  it("aceita os nomes do seed do banco", () => {
    for (const d of ["monograma", "ramo", "flor", "onda", "estrela", "moldura"]) {
      expect(isTileDesign(d)).toBe(true);
    }
  });

  it("recusa nomes desconhecidos e não-strings", () => {
    expect(isTileDesign("Flor")).toBe(false);
    expect(isTileDesign("laço")).toBe(false);
    expect(isTileDesign("")).toBe(false);
    expect(isTileDesign(undefined)).toBe(false);
    expect(isTileDesign(3)).toBe(false);
  });
});

describe("normalizeRotation", () => {
  it("leva ao múltiplo de 90 mais próximo em 0–270", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(100)).toBe(90);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });
});

describe("rotationFor", () => {
  it("roseta forma o bloco 0/90 sobre 270/180", () => {
    expect(rotationFor("roseta", 0, 0)).toBe(0);
    expect(rotationFor("roseta", 1, 0)).toBe(90);
    expect(rotationFor("roseta", 0, 1)).toBe(270);
    expect(rotationFor("roseta", 1, 1)).toBe(180);
  });

  it("repete o padrão e aceita índices negativos", () => {
    expect(rotationFor("roseta", 2, 2)).toBe(0);
    expect(rotationFor("roseta", 3, 0)).toBe(90);
    expect(rotationFor("roseta", -1, 0)).toBe(90);
    expect(rotationFor("roseta", -1, -1)).toBe(180);
  });

  it("inversa é a roseta deslocada um ladrilho", () => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        expect(rotationFor("inversa", c, r)).toBe(rotationFor("roseta", c + 1, r + 1));
      }
    }
  });

  it("aceita matriz própria", () => {
    const m = [[0, 180, 90]] as const;
    expect(rotationsForRow(m, 4)).toEqual([0, 180, 90, 0]);
    expect(rotationFor("reto", 5, 7)).toBe(0);
    expect(rotationFor([], 1, 1)).toBe(0);
  });
});

describe("staggerFromCenter", () => {
  it("começa em zero no centro e cresce com a distância", () => {
    const d = staggerFromCenter(3, 3, { stepMs: 100 });
    expect(d).toHaveLength(9);
    expect(d[4]).toBe(0);
    expect(d[1]).toBe(100);
    expect(d[0]).toBe(141);
    expect(maxDelay(d)).toBe(141);
  });

  it("em grade par, os quatro centrais saem juntos", () => {
    const d = staggerFromCenter(4, 4, { stepMs: 50 });
    expect([d[5], d[6], d[9], d[10]]).toEqual([0, 0, 0, 0]);
    expect(d[0]).toBe(d[15]);
    expect(d[0]).toBeGreaterThan(d[1]);
  });

  it("aceita origem própria e grade vazia", () => {
    expect(staggerFromCenter(3, 1, { stepMs: 10, originCol: 0, originRow: 0 })).toEqual([
      0, 10, 20,
    ]);
    expect(staggerFromCenter(0, 4)).toEqual([]);
  });
});

describe("designForCell", () => {
  it("mantém o mesmo desenho dentro de cada bloco 2×2", () => {
    const list = ["flor", "ramo"] as const;
    expect(designForCell(list, 0, 0)).toBe("flor");
    expect(designForCell(list, 1, 1)).toBe("flor");
    expect(designForCell(list, 2, 0)).toBe("ramo");
    expect(designForCell(list, 2, 2)).toBe("flor");
  });
});

describe("desenhos", () => {
  it("tem 9 desenhos com traços animáveis e sem coordenadas inválidas", () => {
    expect(TILE_DESIGNS).toHaveLength(9);
    for (const d of TILE_DESIGNS) {
      const art = TILE_ART[d];
      expect(art.strokes.length).toBeGreaterThan(3);
      for (const s of art.strokes) {
        expect(s.d).toMatch(/^M/);
        expect(s.d).not.toMatch(/NaN|Infinity/);
        expect(s.w).toBeGreaterThanOrEqual(0.8);
        expect(s.w).toBeLessThanOrEqual(2.6);
      }
    }
  });

  it("o monograma DG tem contorno e linha de escrita em cada parte", () => {
    expect(MONOGRAM_ART.parts.map((p) => p.id)).toEqual(["haste", "s", "esporao", "arco", "pe"]);
    for (const p of MONOGRAM_ART.parts) {
      expect(p.d).toMatch(/^M[\d.]+ [\d.]+.*Z$/);
      expect(p.line).toMatch(/^M/);
      expect(`${p.d}${p.line}`).not.toMatch(/NaN|Infinity|undefined/);
      expect(p.reach).toBeGreaterThan(10);
    }
    // Mais largo que alto, como o arquivo do casal (822 × 492).
    expect(MONOGRAM_ART.width / MONOGRAM_ART.height).toBeCloseTo(1.67, 1);
  });
});
