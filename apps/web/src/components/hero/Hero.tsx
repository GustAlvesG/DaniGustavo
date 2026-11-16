import { useId } from "react";
import { ButtonLink } from "@/components/ui";
import { Countdown } from "@/components/countdown";
import { TileBand, TileGrid } from "@/components/tiles";
import type { HeroContent } from "@/content/placeholder";
import { formatWeddingDate } from "@/lib/countdown";
import { cx } from "@/lib/cx";
import styles from "./hero.module.css";

export type HeroProps = HeroContent & {
  /** h1 na home; h2 em prévias (ex.: /dev/design). */
  headingLevel?: "h1" | "h2";
  className?: string;
};

/**
 * Hero da home (docs/PROMPT.md §4.4). Server Component: o texto vem no HTML
 * estático, visível (é o elemento LCP). A abertura só anima por cima.
 *
 * Celular: faixa de azulejo no topo, nomes em Bodoni de cartaz, data, local,
 * botões empilhados e contagem. ≥1024px: 12 colunas assimétricas, texto à
 * esquerda e um painel de azulejos que sangra até a borda direita.
 */
export function Hero({
  names,
  dateISO,
  venueLabel,
  rsvpHref,
  giftsHref,
  headingLevel = "h1",
  className,
}: HeroProps) {
  const Heading = headingLevel;
  const titleId = useId();
  return (
    <section className={cx(styles.hero, className)} aria-labelledby={titleId}>
      <div className="lg:hidden">
        <TileBand design="ramo" />
      </div>

      <div className={styles.panel} aria-hidden="true">
        <TileGrid design="flor" cols={4} rows={8} className={styles.panelGrid} />
      </div>

      <div className={cx("page-wrap page-grid", styles.body)}>
        <div className={styles.copy}>
          <Heading id={titleId} className={cx("font-display text-tinta", styles.names)}>
            <span className="block" data-hero-line="">
              {names.first}
            </span>{" "}
            <span className="block" data-hero-line="">
              &amp; {names.second}
            </span>
          </Heading>

          <div className={styles.meta}>
            <p className={cx("font-display text-tinta", styles.date)}>
              <time dateTime={dateISO}>{formatWeddingDate(dateISO)}</time>
            </p>
            <p className="text-lg text-tinta/75">{venueLabel}</p>
          </div>

          <div className={styles.actions}>
            <ButtonLink href={rsvpHref} size="lg" variant="primary">
              Confirmar presença
            </ButtonLink>
            <ButtonLink href={giftsHref} size="lg" variant="secondary">
              Ver lista de presentes
            </ButtonLink>
          </div>

          <div className={styles.countdown}>
            <p className="text-base text-tinta/75" aria-hidden="true">
              Faltam
            </p>
            <Countdown target={dateISO} />
          </div>
        </div>
      </div>
    </section>
  );
}
