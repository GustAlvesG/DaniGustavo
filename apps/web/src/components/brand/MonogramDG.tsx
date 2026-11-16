import { useId, type CSSProperties } from "react";
import { MONOGRAM_ART, MONOGRAM_FILLS } from "@/components/tiles/designs";
import { cx } from "@/lib/cx";
import styles from "./brand.module.css";

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
  /**
   * "draw": versão para animar (abertura, /dev/design). Cada parte tem uma
   * linha de centro (`[data-mono-line]`, para o DrawSVG) e uma máscara
   * (`[data-mono-mask]`) que revela o preenchimento atrás da linha. Com
   * `data-resolved` no <svg>, troca tudo pelo preenchimento estático: o fim
   * da animação é idêntico ao monograma parado.
   */
  variant?: "static" | "draw";
  /** Gira 90° (o casal usa o monograma na vertical). */
  vertical?: boolean;
}

/**
 * A ligadura DG do casal em vetor (contornos preenchidos, cor = currentColor).
 * Server Component.
 */
export function MonogramDG({
  className,
  style,
  label,
  bold = 0,
  variant = "static",
  vertical = false,
}: MonogramDGProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { viewBox } = MONOGRAM_ART;
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
  const strokeProps =
    bold > 0
      ? { stroke: "currentColor", strokeWidth: bold, strokeLinejoin: "round" as const }
      : undefined;

  const fills = (
    <g fill="currentColor" {...strokeProps}>
      {MONOGRAM_FILLS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );

  return (
    <svg
      viewBox={viewBox}
      className={cx(styles.mono, vertical && styles.vertical, className)}
      style={style}
      focusable="false"
      data-mono=""
      data-mono-variant={variant}
      {...a11y}
    >
      {variant === "static" ? (
        fills
      ) : (
        <>
          <defs>
            {MONOGRAM_ART.parts.map((p) => (
              <mask key={p.id} id={`${uid}-${p.id}`}>
                <path
                  d={p.line}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={p.reach}
                  data-mono-mask=""
                />
              </mask>
            ))}
          </defs>
          <g fill="currentColor" className={styles.ink} {...strokeProps}>
            {MONOGRAM_ART.parts.map((p) => (
              <path key={p.id} d={p.d} mask={`url(#${uid}-${p.id})`} />
            ))}
          </g>
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth={Math.max(3, bold * 0.6 + 3)}
            className={styles.pen}
          >
            {MONOGRAM_ART.parts.map((p) => (
              <path key={p.id} d={p.line} data-mono-line="" />
            ))}
          </g>
          <g className={styles.final}>{fills}</g>
        </>
      )}
    </svg>
  );
}
