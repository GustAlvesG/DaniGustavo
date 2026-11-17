import type { Gift } from "@casamento/shared";
import { describe, expect, it } from "vitest";
import { filterGifts, firstName, parseReais, quotaText, timeLeft } from "./presentes";

const gift = (over: Partial<Gift>): Gift => ({
  slug: "x",
  title: "X",
  description: null,
  image: null,
  priceCents: 10_000,
  openAmount: false,
  quotaTotal: 1,
  quotaLeft: 1,
  category: "casa",
  ...over,
});

describe("parseReais", () => {
  it("entende os jeitos comuns de escrever reais", () => {
    expect(parseReais("150")).toBe(15_000);
    expect(parseReais("150,5")).toBe(15_050);
    expect(parseReais("R$ 1.234,56")).toBe(123_456);
    expect(parseReais("1234,56")).toBe(123_456);
  });
  it("recusa o que não é valor", () => {
    expect(parseReais("abc")).toBeNull();
    expect(parseReais("1,234.56")).toBeNull();
    expect(parseReais("")).toBeNull();
  });
});

describe("filterGifts", () => {
  const list = [
    gift({ slug: "barato", priceCents: 15_000 }),
    gift({ slug: "medio", priceCents: 45_000, category: "lua-de-mel" }),
    gift({ slug: "caro", priceCents: 89_000 }),
    gift({ slug: "livre", openAmount: true, category: "livre" }),
  ];
  const slugs = (c: string, r: string) => filterGifts(list, c, r).map((g) => g.slug);

  it("filtra por faixa de preço, mantendo o valor livre", () => {
    expect(slugs("todos", "ate-300")).toEqual(["barato", "livre"]);
    expect(slugs("todos", "300-600")).toEqual(["medio", "livre"]);
    expect(slugs("todos", "acima-600")).toEqual(["caro", "livre"]);
  });
  it("filtra por categoria", () => {
    expect(slugs("casa", "todos")).toEqual(["barato", "caro"]);
    expect(slugs("livre", "ate-300")).toEqual(["livre"]);
  });
});

describe("quotaText", () => {
  it("descreve as cotas sem jargão", () => {
    expect(quotaText({ quotaTotal: 4, quotaLeft: 3, openAmount: false })).toBe(
      "3 de 4 cotas disponíveis",
    );
    expect(quotaText({ quotaTotal: 4, quotaLeft: 1, openAmount: false })).toBe("Última cota de 4");
    expect(quotaText({ quotaTotal: 1, quotaLeft: 0, openAmount: false })).toBe("Já presenteado");
    expect(quotaText({ quotaTotal: 999, quotaLeft: 999, openAmount: true })).toBe(
      "Você escolhe o valor",
    );
  });
});

describe("utilitários", () => {
  it("primeiro nome e tempo restante", () => {
    expect(firstName("  Ana Maria Souza ")).toBe("Ana");
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(timeLeft("2026-11-17T12:29:05Z", now)).toBe("29:05");
    expect(timeLeft("2026-11-17T11:00:00Z", now)).toBe("0:00");
  });
});
