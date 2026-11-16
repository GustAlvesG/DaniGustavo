import { useId } from "react";
import type { TileDesign } from "./designs";
import { TileArtGroup } from "./Tile";
import type { TileRotation } from "@/lib/tiles";
import styles from "./tiles.module.css";

/**
 * Faixas e grades repetem o mesmo desenho dezenas de vezes: o desenho vai
 * uma vez num `<symbol>` e cada ladrilho é um `<use>` girado. Menos DOM,
 * mesmo resultado (os traços dentro de `<use>` não são animáveis um a um —
 * para desenhar traço a traço, use <Tile>).
 */
export function useSymbolPrefix(): string {
  return `az${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function symbolId(prefix: string, design: TileDesign): string {
  return `${prefix}-${design}`;
}

export function TileSymbols({
  prefix,
  designs,
}: {
  prefix: string;
  designs: readonly TileDesign[];
}) {
  return (
    <svg className={styles.defs} aria-hidden="true" focusable="false">
      <defs>
        {designs.map((d) => (
          <symbol key={d} id={symbolId(prefix, d)} viewBox="0 0 100 100">
            <TileArtGroup design={d} />
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

export function TileUse({
  href,
  rotate,
  face = "esmalte",
}: {
  href: string;
  rotate: TileRotation;
  face?: "esmalte" | "nevoa";
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={styles.tile}
      data-face={face}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="100" height="100" className={styles.face} />
      <use href={`#${href}`} transform={rotate ? `rotate(${rotate} 50 50)` : undefined} />
    </svg>
  );
}
