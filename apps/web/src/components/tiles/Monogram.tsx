import type { CSSProperties } from "react";
import { MONOGRAM_ART } from "./designs";
import styles from "./tiles.module.css";

export interface MonogramProps {
  className?: string;
  style?: CSSProperties;
  /** Nome acessível (ex.: "D & G"). Sem ele, o monograma é decorativo. */
  label?: string;
  /**
   * Multiplica a espessura dos traços. 1 para 320px ou mais; use ~1,6 por
   * volta de 200px e ~2,2 por volta de 120px para o fio não sumir.
   */
  weight?: number;
  /** Desenho por CSS, como em <Tile drawn>. Omitido: compatível com DrawSVG. */
  drawn?: boolean;
}

/**
 * Monograma D & G em linha cobalto (viewBox 312×150). Todos os traços são
 * `<path data-draw>` na ordem de escrita: D, &, G.
 */
export function Monogram({ className, style, label, weight = 1, drawn }: MonogramProps) {
  const drawable = drawn !== undefined;
  return (
    <svg
      viewBox={MONOGRAM_ART.viewBox}
      className={[styles.monogram, drawable && styles.drawable, className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      data-drawn={drawable ? String(drawn) : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g className={styles.ink}>
        {MONOGRAM_ART.strokes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            strokeWidth={Math.round(s.w * weight * 100) / 100}
            data-draw=""
            pathLength={drawable ? 1 : undefined}
            style={drawable ? ({ "--i": i } as CSSProperties) : undefined}
          />
        ))}
      </g>
    </svg>
  );
}
