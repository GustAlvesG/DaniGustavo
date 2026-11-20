import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "@casamento/shared";
import { CONTRAST_PAIRS, PALETTE, minimumRatio } from "./palette";

describe("paleta do álbum (WCAG 2.2 AA)", () => {
  it.each(CONTRAST_PAIRS.map((p) => [`${p.fg} sobre ${p.bg} (${p.role})`, p] as const))(
    "%s",
    (_, pair) => {
      const ratio = contrastRatio(PALETTE[pair.fg], PALETTE[pair.bg]);
      expect(ratio).toBeGreaterThanOrEqual(minimumRatio(pair.kind));
    },
  );

  it("confere as razões principais", () => {
    expect(contrastRatio(PALETTE.tinta, PALETTE.papel)).toBeGreaterThan(13);
    expect(contrastRatio(PALETTE.suave, PALETTE.papel)).toBeGreaterThan(6.5);
    expect(contrastRatio(PALETTE.branco, PALETTE.marinho)).toBeGreaterThan(15);
  });

  it("serenity não serve de texto sobre o papel (só fita, pontos e acento)", () => {
    expect(contrastRatio(PALETTE.serenity, PALETTE.papel)).toBeLessThan(3);
  });

  it("globals.css usa os mesmos valores", () => {
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8").toLowerCase();
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(css).toContain(`--color-${name}: ${hex.toLowerCase()};`);
    }
  });
});
