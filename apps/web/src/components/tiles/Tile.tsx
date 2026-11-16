import type { CSSProperties } from "react";
import { TILE_ART, type TileDesign } from "./designs";
import type { TileRotation } from "@/lib/tiles";
import styles from "./tiles.module.css";

export type TileFace = "esmalte" | "nevoa" | "none";

export interface TileProps {
  design: TileDesign;
  /** Rotação em graus, aplicada na geometria do SVG (não em CSS). */
  rotate?: TileRotation;
  /** Largura fixa (px ou qualquer medida CSS). Sem ela, ocupa 100% do pai. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Com título, o ladrilho vira `role="img"`; sem, é decorativo (aria-hidden). */
  title?: string;
  /**
   * Desenho por CSS. Omitido (padrão): traço estático, compatível com o
   * DrawSVGPlugin do GSAP. `false`: traços escondidos (pathLength="1");
   * trocar o atributo `data-drawn` do `<svg>` para "true" (ou renderizar de
   * novo com `drawn`) desenha os traços em ordem.
   */
  drawn?: boolean;
  /** Fundo do ladrilho: esmalte (padrão), névoa ou transparente. */
  face?: TileFace;
}

function cx(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** Os traços, a aguada e os pontos de um desenho (no espaço 0–100). */
export function TileArtGroup({
  design,
  rotate = 0,
  drawable = false,
}: {
  design: TileDesign;
  rotate?: TileRotation;
  drawable?: boolean;
}) {
  const art = TILE_ART[design];
  const n = art.strokes.length;
  return (
    <g transform={rotate ? `rotate(${rotate} 50 50)` : undefined}>
      {art.wash.length > 0 && (
        <g className={styles.wash}>
          {art.wash.map((d, i) => (
            <path
              key={i}
              d={d}
              data-wash=""
              style={drawable ? ({ "--n": n } as CSSProperties) : undefined}
            />
          ))}
        </g>
      )}
      <g className={styles.ink}>
        {art.strokes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            strokeWidth={s.w}
            data-draw=""
            data-tone={s.tone}
            pathLength={drawable ? 1 : undefined}
            style={drawable ? ({ "--i": i } as CSSProperties) : undefined}
          />
        ))}
      </g>
      {art.dots.length > 0 && (
        <g className={styles.dots}>
          {art.dots.map((c, i) => (
            <circle
              key={i}
              cx={c.cx}
              cy={c.cy}
              r={c.r}
              data-dot=""
              style={drawable ? ({ "--n": n } as CSSProperties) : undefined}
            />
          ))}
        </g>
      )}
    </g>
  );
}

/**
 * Um ladrilho de azulejo: SVG 1:1, traço cobalto sobre esmalte.
 * Server Component (sem estado).
 */
export function Tile({
  design,
  rotate = 0,
  size,
  className,
  style,
  title,
  drawn,
  face = "esmalte",
}: TileProps) {
  const drawable = drawn !== undefined;
  return (
    <svg
      viewBox="0 0 100 100"
      className={cx(styles.tile, drawable && styles.drawable, className)}
      style={size !== undefined ? { width: size, ...style } : style}
      data-tile={design}
      data-face={face}
      data-drawn={drawable ? String(drawn) : undefined}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {face !== "none" && <rect width="100" height="100" className={styles.face} />}
      <TileArtGroup design={design} rotate={rotate} drawable={drawable} />
    </svg>
  );
}
