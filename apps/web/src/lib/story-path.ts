/**
 * A linha de tinta de "Nossa história": um único caminho SVG que passa por
 * todos os marcos (anos), com curvas de traço feito à mão. Puro (testável).
 */

export type Point = { x: number; y: number };

const r = (n: number) => Math.round(n * 10) / 10;

/**
 * Horizontal: entra pela esquerda, costura os marcos (que alternam alto e
 * baixo) com curvas em S de tangente horizontal — x sempre cresce, então
 * "quanto desenhar" vira uma busca por x — e sai num remate à direita.
 *
 * Vertical: desce pela coluna com um balanço leve entre os marcos (y sempre
 * cresce) até o fim da trilha.
 */
export function storyPath(
  points: readonly Point[],
  direction: "horizontal" | "vertical",
  box: { width: number; height: number },
): string {
  if (points.length === 0) return "";
  const [first] = points;
  const last = points[points.length - 1];

  if (direction === "horizontal") {
    const lead = Math.min(320, first.x);
    const d = [`M${r(first.x - lead)} ${r(first.y + 70)}`];
    d.push(
      `C${r(first.x - lead * 0.45)} ${r(first.y + 70)} ${r(first.x - lead * 0.35)} ${r(first.y)} ${r(first.x)} ${r(first.y)}`,
    );
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1];
      const q = points[i];
      const dx = q.x - p.x;
      d.push(`C${r(p.x + dx * 0.5)} ${r(p.y)} ${r(q.x - dx * 0.5)} ${r(q.y)} ${r(q.x)} ${r(q.y)}`);
    }
    // Remate: sobe num arco curto e assenta, como a pincelada final.
    const tail = Math.min(260, Math.max(80, box.width - last.x - 40));
    d.push(
      `C${r(last.x + tail * 0.4)} ${r(last.y)} ${r(last.x + tail * 0.6)} ${r(last.y - 56)} ${r(last.x + tail)} ${r(last.y - 56)}`,
    );
    return d.join(" ");
  }

  const top = Math.max(0, first.y - 48);
  const bottom = Math.max(last.y + 48, box.height - 8);
  const d = [`M${r(first.x)} ${r(top)}`, `L${r(first.x)} ${r(first.y)}`];
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    const dy = q.y - p.y;
    const sway = i % 2 ? 9 : -9;
    d.push(
      `C${r(p.x + sway)} ${r(p.y + dy * 0.4)} ${r(q.x + sway)} ${r(q.y - dy * 0.4)} ${r(q.x)} ${r(q.y)}`,
    );
  }
  d.push(
    `C${r(last.x)} ${r(last.y + (bottom - last.y) * 0.5)} ${r(last.x - 6)} ${r(bottom - 20)} ${r(last.x)} ${r(bottom)}`,
  );
  return d.join(" ");
}
