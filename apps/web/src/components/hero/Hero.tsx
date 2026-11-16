import { useId, ViewTransition } from "react";
import { MonogramDG, Seal } from "@/components/brand";
import { ButtonLink } from "@/components/ui";
import { Countdown } from "@/components/countdown";
import { TileBand, TileGrid } from "@/components/tiles";
import type { HeroContent } from "@/content/placeholder";
import { formatWeddingDate } from "@/lib/countdown";
import { cx } from "@/lib/cx";
import { formatSealDate } from "@/lib/site";
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
 * Campo marinho, nomes brancos em Bodoni de cartaz. Celular: faixa de
 * azulejo no topo e o selo do casal ao lado de "Dani". ≥1024px: 12 colunas
 * assimétricas, texto à esquerda e um painel de azulejos que sangra até a
 * borda direita, com o arco claro do monograma no meio (o cartão do manual).
 */
export function Hero({
  names,
  dateISO,
  timeZone,
  venueName,
  venueCity,
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
        <TileBand design="rosa" />
      </div>

      <div className={styles.panel} aria-hidden="true">
        <TileGrid design="flor" cols={3} rows={6} className={styles.panelGrid} />
        {/* Arco do monograma: par da View Transition com o cabeçalho das
            páginas internas (o monograma "voa" entre as páginas). */}
        <div className={cx(styles.arch, "surface-relevo card-relevo shape-arch")}>
          <ViewTransition name="monograma" share="monograma" default="none">
            <span className={styles.archMono}>
              <MonogramDG bold={4} />
            </span>
          </ViewTransition>
          <span className={styles.archDate}>{formatSealDate(dateISO, timeZone)}</span>
        </div>
      </div>

      <div className={cx("page-wrap page-grid", styles.body)}>
        <div className={styles.copy}>
          <Heading id={titleId} className={cx("font-display text-ink", styles.names)}>
            <span className="block" data-hero-line="">
              {names.first}
            </span>{" "}
            <span className="block" data-hero-line="">
              &amp; {names.second}
            </span>
          </Heading>

          <div className={styles.meta}>
            <p className={cx("font-display text-ink", styles.date)}>
              <time dateTime={dateISO}>{formatWeddingDate(dateISO, timeZone)}</time>
            </p>
            <div className={styles.place}>
              <p className="text-lg text-ink-soft">
                {venueName}
                {venueCity ? (
                  <>
                    <br />
                    {venueCity}
                  </>
                ) : null}
              </p>
              <Seal className={styles.seal} tone="relevo" date={dateISO} timeZone={timeZone} />
            </div>
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
            <p className="text-base text-ink-soft" aria-hidden="true">
              Faltam
            </p>
            <Countdown target={dateISO} />
          </div>
        </div>
      </div>

      {/* Base do hero e separador da próxima seção (§4.4). Parada: já está na
          primeira tela, onde o observador da faixa (6% de margem) não a vira. */}
      <div className="lg:hidden">
        <TileBand design="onda" animate={false} />
      </div>
    </section>
  );
}
