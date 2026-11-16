import type { CSSProperties } from "react";
import { formatSealDate } from "@/lib/site";
import { cx } from "@/lib/cx";
import { MonogramDG } from "./MonogramDG";
import styles from "./brand.module.css";

export interface SealProps {
  /** Data do casamento (ISO com fuso); vira "10.04.27". Sem ela, só o monograma. */
  date?: string;
  timeZone?: string;
  /** Diâmetro (qualquer medida CSS). */
  size?: string;
  /** Selo marinho com o DG branco (padrão) ou claro com o DG marinho. */
  tone?: "marinho" | "relevo" | "royal";
  className?: string;
  style?: CSSProperties;
}

/**
 * Selo circular do casal: o DG com a data embaixo, como o selo do manual.
 * Decorativo (a data por extenso sempre aparece em texto perto dele).
 */
export function Seal({ date, timeZone, size, tone = "marinho", className, style }: SealProps) {
  return (
    <div
      aria-hidden="true"
      className={cx(styles.seal, styles.sealRing, `surface-${tone}`, className)}
      style={{ ...(size ? { "--seal-size": size } : null), ...style } as CSSProperties}
    >
      <MonogramDG className={styles.sealMono} bold={10} />
      {date ? <span className={styles.sealDate}>{formatSealDate(date, timeZone)}</span> : null}
    </div>
  );
}
