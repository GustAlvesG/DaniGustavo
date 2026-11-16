import type { ReactNode } from "react";
import { TileBand, type TileDesign } from "@/components/tiles";
import { cx } from "@/lib/cx";

/**
 * Seção da home: faixa de azulejo no topo (o separador, PROMPT §4.4; a
 * virada da faixa é a única animação de entrada) e respiro vertical padrão.
 */
export function Section({
  id,
  band,
  children,
  className,
}: {
  id: string;
  band?: TileDesign;
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      {band ? <TileBand design={band} /> : null}
      <section id={id} aria-labelledby={`${id}-titulo`} className={cx("section-space", className)}>
        <div className="page-wrap page-grid gap-y-12">{children}</div>
      </section>
    </>
  );
}
