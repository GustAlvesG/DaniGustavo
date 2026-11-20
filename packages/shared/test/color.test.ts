import { describe, expect, it } from "vitest";
import { contrastLevel, contrastRatio, formatRatio, parseHex, relativeLuminance } from "./contrast";

describe("parseHex", () => {
  it("lê seis e três dígitos, com ou sem #", () => {
    expect(parseHex("#1F3FAE")).toEqual([31, 63, 174]);
    expect(parseHex("fff")).toEqual([255, 255, 255]);
  });

  it("recusa cor inválida", () => {
    expect(() => parseHex("#12345")).toThrow();
    expect(() => parseHex("azul")).toThrow();
  });
});

describe("relativeLuminance", () => {
  it("vai de 0 (preto) a 1 (branco)", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
  });
});

describe("contrastRatio", () => {
  it("preto sobre branco é 21:1, em qualquer ordem", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
  });

  it("uma cor contra ela mesma é 1:1", () => {
    expect(contrastRatio("#1f3fae", "#1f3fae")).toBe(1);
  });

  it("confere pares da paleta do casal", () => {
    expect(contrastRatio("#ffffff", "#15244b")).toBeCloseTo(15.15, 1);
    expect(contrastRatio("#15244b", "#f3f9fd")).toBeCloseTo(14.27, 1);
  });
});

describe("contrastLevel", () => {
  it("classifica pelos limites da WCAG", () => {
    expect(contrastLevel(7)).toBe("AAA");
    expect(contrastLevel(6.99)).toBe("AA");
    expect(contrastLevel(4.5)).toBe("AA");
    expect(contrastLevel(4.49)).toBe("AA grande");
    expect(contrastLevel(3)).toBe("AA grande");
    expect(contrastLevel(2.99)).toBe("falha");
  });
});

describe("formatRatio", () => {
  it("usa vírgula decimal e uma casa", () => {
    expect(formatRatio(8.599)).toBe("8,6:1");
    expect(formatRatio(15.486)).toBe("15,5:1");
    expect(formatRatio(21)).toBe("21,0:1");
  });

  it("mostra duas casas quando arredondar passaria um limite da WCAG", () => {
    expect(formatRatio(4.477)).toBe("4,47:1");
    expect(formatRatio(2.96)).toBe("2,96:1");
    expect(formatRatio(6.97)).toBe("6,97:1");
    expect(formatRatio(4.5)).toBe("4,5:1");
  });
});
