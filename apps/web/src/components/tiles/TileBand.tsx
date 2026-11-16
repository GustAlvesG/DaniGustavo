import type { CSSProperties } from "react";
import { TILE_ART, type TileDesign } from "./designs";
import { TileBandFlip } from "./TileBandFlip";
import { TileSymbols, TileUse, symbolId, useSymbolPrefix } from "./TileSymbols";
import { rotationFor, type TilePattern } from "@/lib/tiles";
import styles from "./tiles.module.css";

/** Ladrilhos renderizados quando a faixa preenche a largura (os que não cabem ficam ocultos). */
const FILL_COUNT = 24;

export interface TileBandProps {
  design: TileDesign;
  /** Número fixo de ladrilhos; sem ele, a faixa preenche a largura (60px+ no celular, 84px+ no desktop). */
  count?: number;
  /** Padrão de rotações; padrão: o do desenho (`roseta` → 0, 90, 0, 90…). */
  pattern?: TilePattern;
  /** Linha do padrão usada pela faixa (0 ou 1 numa roseta). */
  row?: number;
  /** Junta de 1px em névoa entre ladrilhos (padrão) ou nenhuma. */
  joint?: "fina" | "none";
  /** Vira os ladrilhos ao entrar na tela (padrão) ou mostra parado. */
  animate?: boolean;
  /** Mudar este valor repete a animação (para /dev/design). */
  replayKey?: string | number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Faixa de azulejos que separa seções. Server Component; só o observador
 * da animação (TileBandFlip) roda no cliente.
 */
export function TileBand({
  design,
  count,
  pattern,
  row = 0,
  joint = "fina",
  animate = true,
  replayKey,
  className,
  style,
}: TileBandProps) {
  const prefix = useSymbolPrefix();
  const n = count && count > 0 ? Math.floor(count) : FILL_COUNT;
  const p: TilePattern = pattern ?? TILE_ART[design].pattern;
  const href = symbolId(prefix, design);
  const cells = Array.from({ length: n }, (_, i) => (
    <div key={i} className={styles.cell} style={{ "--i": i } as CSSProperties}>
      <div className={styles.card}>
        <div className={styles.front}>
          <TileUse href={href} rotate={rotationFor(p, i, row)} />
        </div>
        {animate && <div className={styles.back} />}
      </div>
    </div>
  ));
  const props = {
    className: [styles.band, className].filter(Boolean).join(" "),
    style: (count ? { "--count": n, ...style } : style) as CSSProperties | undefined,
    "data-count": count ? n : undefined,
    "data-joint": joint === "none" ? "none" : undefined,
    "aria-hidden": true,
  } as const;
  return (
    <>
      <TileSymbols prefix={prefix} designs={[design]} />
      {animate ? (
        <TileBandFlip {...props} replayKey={replayKey}>
          {cells}
        </TileBandFlip>
      ) : (
        <div {...props} data-flip="done">
          {cells}
        </div>
      )}
    </>
  );
}
