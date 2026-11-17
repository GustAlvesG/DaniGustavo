import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { MONOGRAM_FILLS, MONOGRAM_VIEWBOX } from "./monogram-art";

export interface MonogramDGProps {
  className?: string;
  style?: CSSProperties;
  /** Nome acessível (ex.: "Dani & Gustavo"). Sem ele, o monograma é decorativo. */
  label?: string;
  /**
   * Engrossa os fios em tamanhos pequenos: contorno da mesma cor com esta
   * espessura (unidades do desenho, 822 de largura). 0 acima de ~160px; ~8
   * por volta de 80px; ~24 num ícone de 32px.
   */
  bold?: number;
}

/** A ligadura DG do casal em vetor (cor = currentColor). Server Component. */
export function MonogramDG({ className, style, label, bold = 0 }: MonogramDGProps) {
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
  const strokeProps =
    bold > 0
      ? { stroke: "currentColor", strokeWidth: bold, strokeLinejoin: "round" as const }
      : undefined;

  return (
    <svg
      viewBox={MONOGRAM_VIEWBOX}
      className={cx("mono-dg", className)}
      style={style}
      focusable="false"
      data-mono=""
      {...a11y}
    >
      <g fill="currentColor" {...strokeProps}>
        {MONOGRAM_FILLS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** O monograma como texto SVG (para a imagem Open Graph, fora do React). */
export function monogramMarkup({ ink, bold = 0 }: { ink: string; bold?: number }): string {
  const stroke = bold > 0 ? ` stroke="${ink}" stroke-width="${bold}" stroke-linejoin="round"` : "";
  return `<g fill="${ink}"${stroke}>${MONOGRAM_FILLS.map((d) => `<path d="${d}"/>`).join("")}</g>`;
}
