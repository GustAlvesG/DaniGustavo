import type { CSSProperties } from "react";
import { TILE_ART, type TileDesign } from "./designs";
import { TileSymbols, TileUse, symbolId, useSymbolPrefix } from "./TileSymbols";
import { designForCell, rotationFor, type TilePattern } from "@/lib/tiles";
import styles from "./tiles.module.css";

export interface TileGridProps {
  /** Um desenho, ou vários (cada bloco 2×2 usa um, em sequência). Padrão: flor. */
  design?: TileDesign | readonly TileDesign[];
  cols: number;
  rows: number;
  /** Padrão de rotações; padrão: o do (primeiro) desenho. */
  pattern?: TilePattern;
  joint?: "fina" | "none";
  face?: "campo";
  className?: string;
  /** Classe de cada célula (ex.: para a abertura animar a virada). */
  cellClassName?: string;
  style?: CSSProperties;
}

/**
 * Grade estática de azulejos (fundos, placeholders, abertura). Cada célula
 * recebe `data-col`, `data-row` e as variáveis CSS `--col`/`--row`.
 */
export function TileGrid({
  design = "flor",
  cols,
  rows,
  pattern,
  joint = "fina",
  face = "campo",
  className,
  cellClassName,
  style,
}: TileGridProps) {
  const prefix = useSymbolPrefix();
  const designs: readonly TileDesign[] =
    typeof design === "string" ? [design] : design.length ? design : ["flor"];
  const unique = Array.from(new Set(designs));
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const cells = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const d = designForCell(designs, col, row);
      const rot = rotationFor(pattern ?? TILE_ART[d].pattern, col, row);
      cells.push(
        <div
          key={`${col}-${row}`}
          className={cellClassName}
          data-col={col}
          data-row={row}
          style={{ "--col": col, "--row": row } as CSSProperties}
        >
          <TileUse href={symbolId(prefix, d)} rotate={rot} face={face} />
        </div>,
      );
    }
  }
  return (
    <>
      <TileSymbols prefix={prefix} designs={unique} />
      <div
        className={[styles.grid, className].filter(Boolean).join(" ")}
        style={{ "--cols": c, ...style } as CSSProperties}
        data-joint={joint === "none" ? "none" : undefined}
        aria-hidden="true"
      >
        {cells}
      </div>
    </>
  );
}
