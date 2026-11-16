import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "./contrast";
import { CONTRAST_PAIRS, PALETTE, minimumRatio } from "./palette";

describe("paleta do casal (WCAG 2.2 AA)", () => {
  it.each(CONTRAST_PAIRS.map((p) => [`${p.fg} sobre ${p.bg} (${p.role})`, p] as const))(
    "%s",
    (_, pair) => {
      const ratio = contrastRatio(PALETTE[pair.fg], PALETTE[pair.bg]);
      expect(ratio).toBeGreaterThanOrEqual(minimumRatio(pair.kind));
    },
  );

  it("confere as razões principais", () => {
    expect(contrastRatio(PALETTE.branco, PALETTE.marinho)).toBeCloseTo(15.15, 1);
    expect(contrastRatio(PALETTE.celeste, PALETTE.marinho)).toBeCloseTo(9.63, 1);
    expect(contrastRatio(PALETTE.serenity, PALETTE.marinho)).toBeCloseTo(6.31, 1);
    expect(contrastRatio(PALETTE.marinho, PALETTE.relevo)).toBeCloseTo(14.27, 1);
    expect(contrastRatio(PALETTE.coral, PALETTE.marinho)).toBeGreaterThan(8);
  });

  it("royal não serve de texto sobre o marinho (só moldura sobre o claro)", () => {
    expect(contrastRatio(PALETTE.royal, PALETTE.marinho)).toBeLessThan(3);
  });

  it("globals.css usa os mesmos valores", () => {
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8").toLowerCase();
    for (const [name, hex] of Object.entries(PALETTE)) {
      expect(css).toContain(`--color-${name}: ${hex.toLowerCase()};`);
    }
  });
});
