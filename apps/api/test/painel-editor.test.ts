import { MEDIA_MAX_DIMENSION, MEDIA_THUMB_WIDTH, SiteSections } from "@casamento/shared";
import { describe, expect, it } from "vitest";
import { SECTION_SPECS } from "../painel/src/editor/fields.ts";
import {
  albumSlug,
  albumsOf,
  canSendOriginal,
  chunk,
  fitWithin,
  getPath,
  moveItem,
  reorderIds,
  setPath,
  thumbSize,
} from "../painel/src/editor/logic.ts";

// Lógica pura do editor do painel (frente A, Fase 2).

describe("getPath / setPath", () => {
  it("lê e grava caminhos aninhados sem mexer no original", () => {
    const a = { hero: { countdown: { title: "x" } } };
    const b = setPath(a, "hero.countdown.title", "y");
    expect(getPath(a, "hero.countdown.title")).toBe("x");
    expect(getPath(b, "hero.countdown.title")).toBe("y");
    expect(getPath(setPath({}, "a.b.c", 1), "a.b.c")).toBe(1);
    expect(getPath({}, "a.b")).toBeUndefined();
  });
});

describe("moveItem / reorderIds / chunk", () => {
  it("move dentro dos limites e ignora fora deles", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, 3)).toEqual([1, 2, 3]);
    expect(reorderIds([5, 6, 7], 7, -1)).toEqual([5, 7, 6]);
    expect(reorderIds([5, 6, 7], 5, -1)).toEqual([5, 6, 7]);
  });
  it("divide o envio em lotes de 20", () => {
    const lots = chunk(Array.from({ length: 45 }, (_, i) => i));
    expect(lots.map((l) => l.length)).toEqual([20, 20, 5]);
  });
});

describe("dimensões da redução no navegador", () => {
  it("reduz só o que passa do limite, mantendo a proporção", () => {
    expect(fitWithin(1000, 500, MEDIA_MAX_DIMENSION)).toMatchObject({ scaled: false });
    const r = fitWithin(5120, 2560, MEDIA_MAX_DIMENSION);
    expect(r).toEqual({ width: 2560, height: 1280, scaled: true });
  });
  it("miniatura com 640 de largura, sem ampliar", () => {
    expect(thumbSize(1280, 960)).toEqual({ width: MEDIA_THUMB_WIDTH, height: 480 });
    expect(thumbSize(300, 200)).toEqual({ width: 300, height: 200 });
  });
  it("só envia o original se tipo, peso e tamanho cabem", () => {
    expect(canSendOriginal({ type: "image/jpeg", size: 1000 }, 2000, 1000)).toBe(true);
    expect(canSendOriginal({ type: "image/gif", size: 1000 }, 100, 100)).toBe(false);
    expect(canSendOriginal({ type: "image/png", size: 5 * 1024 * 1024 }, 100, 100)).toBe(false);
    expect(canSendOriginal({ type: "image/png", size: 1000 }, 3000, 100)).toBe(false);
  });
});

describe("álbuns", () => {
  it("lista sem repetir e normaliza o nome", () => {
    expect(albumsOf([{ album: "b" }, { album: null }, { album: "a" }, { album: "b" }])).toEqual([
      "a",
      "b",
    ]);
    expect(albumSlug("  Pré-Wedding 2! ")).toBe("pre-wedding-2");
    expect(albumSlug("")).toBe("");
  });
});

describe("campos do editor × SiteSections", () => {
  const sections = SiteSections.parse({});
  it("todo caminho descrito existe no schema (valor padrão definido)", () => {
    for (const spec of SECTION_SPECS) {
      for (const f of spec.fields) {
        const v = getPath(sections, f.path);
        expect(v, f.path).not.toBeUndefined();
      }
      for (const l of [...(spec.lists ?? []), ...(spec.photoLists ?? [])]) {
        expect(Array.isArray(getPath(sections, l.path)), l.path).toBe(true);
      }
    }
  });
  it("o item em branco de cada lista é válido", () => {
    for (const spec of SECTION_SPECS) {
      for (const l of spec.lists ?? []) {
        const parsed = SiteSections.safeParse(setPath(sections, l.path, [l.blank]));
        // Links em branco ("/") passam; textos vazios dos botões/links são recusados de propósito.
        if (l.fields.some((f) => f.kind === "link")) continue;
        expect(parsed.success, l.path).toBe(true);
      }
    }
  });
});
