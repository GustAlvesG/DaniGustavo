import { describe, expect, it } from "vitest";
import { storyPath } from "./story-path";

const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);

describe("storyPath", () => {
  it("vazio sem marcos", () => {
    expect(storyPath([], "vertical", { width: 10, height: 10 })).toBe("");
  });

  it("horizontal passa por todos os marcos com x crescente", () => {
    const pts = [
      { x: 600, y: 300 },
      { x: 1000, y: 650 },
      { x: 1400, y: 300 },
    ];
    const d = storyPath(pts, "horizontal", { width: 2000, height: 900 });
    expect(d.startsWith("M")).toBe(true);
    pts.forEach((p) => expect(d).toContain(`${p.x} ${p.y}`));
    const xs = numbers(d).filter((_, i) => i % 2 === 0);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
  });

  it("vertical desce até o fim da trilha", () => {
    const pts = [
      { x: 11, y: 100 },
      { x: 11, y: 700 },
    ];
    const d = storyPath(pts, "vertical", { width: 300, height: 1200 });
    pts.forEach((p) => expect(d).toContain(`${p.x} ${p.y}`));
    expect(d.endsWith("11 1192")).toBe(true);
  });
});
