import { describe, expect, it } from "vitest";
import {
  OPENING_MAX_DOOR_COLS,
  OPENING_MAX_ROWS,
  OPENING_STORAGE_KEY,
  doorColumns,
  openingCells,
  openingDuration,
  openingInlineScript,
  rowsPerHalf,
  shouldPlayOpening,
  waveDelays,
} from "./opening";

const store = (value: string | null) => ({ getItem: () => value });

describe("shouldPlayOpening", () => {
  it("roda completa na primeira visita", () => {
    expect(shouldPlayOpening(store(null), false)).toBe("full");
  });
  it("vira fade com movimento reduzido", () => {
    expect(shouldPlayOpening(store(null), true)).toBe("fade");
  });
  it("não repete na sessão", () => {
    expect(shouldPlayOpening(store("1"), false)).toBe("none");
    expect(shouldPlayOpening(store("1"), true)).toBe("none");
  });
  it("sem sessionStorage (ou bloqueado), não roda", () => {
    expect(shouldPlayOpening(null, false)).toBe("none");
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(shouldPlayOpening(throwing, false)).toBe("none");
  });
});

describe("openingInlineScript", () => {
  it("é JS válido e marca o <html> só na home e só sem a chave", () => {
    const run = (pathname: string, seen: string | null) => {
      const attrs: Record<string, string> = {};
      const html = {
        setAttribute: (k: string, v: string) => (attrs[k] = v),
        getAttribute: (k: string) => attrs[k] ?? null,
        removeAttribute: (k: string) => delete attrs[k],
      };
      const win: Record<string, unknown> = {};
      new Function(
        "location",
        "sessionStorage",
        "document",
        "window",
        "setTimeout",
        openingInlineScript(),
      )(
        { pathname },
        { getItem: (k: string) => (k === OPENING_STORAGE_KEY ? seen : null) },
        { documentElement: html },
        win,
        () => 0,
      );
      return { attrs, win };
    };
    expect(run("/", null).attrs["data-opening"]).toBe("pending");
    expect(run("/", null).win.__dgOpening).toBe(1);
    expect(run("/", "1").attrs["data-opening"]).toBeUndefined();
    expect(run("/confirmar", null).attrs["data-opening"]).toBeUndefined();
  });
});

describe("geometria", () => {
  it("colunas por folha conforme a tela", () => {
    expect(doorColumns(390, 844)).toBe(3);
    expect(doorColumns(768, 1024)).toBe(4);
    expect(doorColumns(1440, 900)).toBe(5);
  });

  it("renderiza no máximo 160 células e ≤ 120 visíveis nas telas de referência", () => {
    const cells = openingCells();
    expect(cells).toHaveLength(2 * OPENING_MAX_ROWS * OPENING_MAX_DOOR_COLS);
    for (const [w, h] of [
      [390, 844],
      [360, 800],
      [1440, 900],
      [1280, 1024],
      [768, 1024],
    ]) {
      const c = doorColumns(w, h);
      const tile = w / 2 / c;
      const visible = 2 * c * 2 * rowsPerHalf(h, tile);
      expect(visible).toBeLessThanOrEqual(120);
      // As linhas renderizadas cobrem a altura.
      expect(rowsPerHalf(h, tile) * tile * 2).toBeGreaterThanOrEqual(h);
    }
  });

  it("o campo do monograma tem 4 × 2 ladrilhos, colado na junta", () => {
    const field = openingCells().filter((c) => c.field);
    expect(field).toHaveLength(8);
    expect(new Set(field.map((c) => c.j))).toEqual(new Set([-1, 0]));
  });

  it("colunas globais fecham através da junta", () => {
    const cells = openingCells();
    const left0 = cells.find((c) => c.door === "l" && c.k === 0);
    const right0 = cells.find((c) => c.door === "r" && c.k === 0);
    expect(left0?.col).toBe(-1);
    expect(right0?.col).toBe(0);
  });
});

describe("waveDelays", () => {
  it("nasce no centro e cabe no espalhamento pedido", () => {
    const cells = openingCells();
    const delays = waveDelays(cells, 0.55);
    expect(Math.min(...delays)).toBe(0);
    expect(Math.max(...delays)).toBeCloseTo(0.55, 5);
    const center = cells.findIndex((c) => c.k === 0 && c.j === 0);
    const corner = cells.findIndex((c) => c.k === 4 && c.j === 7);
    expect(delays[center]).toBe(0);
    expect(delays[corner]).toBeGreaterThan(0.5);
  });
  it("é simétrico entre as folhas", () => {
    const d = waveDelays(
      [
        { door: "l", k: 1, j: 2 },
        { door: "r", k: 1, j: 2 },
      ],
      1,
    );
    expect(d[0]).toBe(d[1]);
  });
  it("lista vazia", () => {
    expect(waveDelays([], 1)).toEqual([]);
  });
});

describe("openingDuration", () => {
  it("cabe em 3,2 s com o DG (5 partes) e os nomes (12 letras)", () => {
    expect(openingDuration(5, 12)).toBeLessThanOrEqual(3.2);
  });
});
