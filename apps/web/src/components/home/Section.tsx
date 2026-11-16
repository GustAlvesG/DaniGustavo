import type { ReactNode } from "react";
import { TileBand, type TileDesign } from "@/components/tiles";
import { cx } from "@/lib/cx";

/**
 * Seção da home: faixa de azulejo no topo (o separador, PROMPT §4.4; a
 * virada da faixa é a única animação de entrada) e respiro vertical padrão.
 * `surface="relevo"` vira uma seção clara (linha royal sobre o relevo), para
 * dar ritmo ao marinho dominante; a faixa entra junto, já na cor nova.
 */
export function Section({
  id,
  band,
  surface = "marinho",
  children,
  className,
}: {
  id: string;
  band?: TileDesign;
  surface?: "marinho" | "relevo";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={surface === "relevo" ? "surface-relevo" : undefined}>
      {band ? <TileBand design={band} /> : null}
      <section id={id} aria-labelledby={`${id}-titulo`} className={cx("section-space", className)}>
        <div className="page-wrap page-grid gap-y-12">{children}</div>
      </section>
    </div>
  );
}
