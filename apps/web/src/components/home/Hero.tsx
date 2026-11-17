import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
import type { SiteContent } from "@casamento/shared";
import { MonogramDG } from "@/components/brand";
import { Countdown } from "@/components/countdown";
import { home } from "@/content/home";
import { foto } from "@/lib/fotos";
import { formatWeddingDate } from "@/lib/countdown";
import { cityFromAddress, formatDotDate, splitCoupleNames } from "@/lib/site";
import { preencher } from "@/lib/texto";
import styles from "./home.module.css";

/**
 * Topo da home: a foto do casal ocupa a tela (100svh, nunca encolhe), com
 * monograma, nomes em Pinyon Script, data e local por cima, e a contagem
 * regressiva presa à base. Ao rolar, a foto desce devagar (parallax) e o
 * texto sobe e some; a data passa para o menu (NavDate).
 *
 * Foto diferente no celular e no computador ("art direction"): um <picture>
 * com duas fontes. `getImageProps` dá as URLs otimizadas do next/image sem
 * renderizar um <Image>, para montar o <picture> à mão.
 */
export function Hero({ site }: { site: SiteContent }) {
  const { hero } = home;
  const { first, second } = splitCoupleNames(site.couple.names);
  const tz = site.wedding.timezone;
  const city = cityFromAddress(site.ceremony.address).split(",")[0];

  const desktop = foto(hero.fotoDesktop.arquivo);
  const mobile = foto(hero.fotoCelular.arquivo);
  const common = { alt: hero.fotoCelular.alt, sizes: "100vw", quality: 75 } as const;
  const {
    props: { srcSet: desktopSrcSet },
  } = getImageProps({ ...common, src: desktop.src, width: desktop.width, height: desktop.height });
  const {
    props: { srcSet: mobileSrcSet, ...img },
  } = getImageProps({
    ...common,
    src: mobile.src,
    width: mobile.width,
    height: mobile.height,
    loading: "eager",
    fetchPriority: "high",
  });

  return (
    <section
      className={styles.hero}
      id="inicio"
      aria-labelledby="hero-titulo"
      // Parte visível de cada foto quando cortada (content/home.ts → posicao).
      style={
        {
          "--pos-celular": hero.fotoCelular.posicao ?? "center",
          "--pos-desktop": hero.fotoDesktop.posicao ?? "center",
        } as CSSProperties
      }
    >
      <div className={styles.heroBg}>
        <picture>
          <source media="(min-width: 701px)" srcSet={desktopSrcSet} sizes="100vw" />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- o alt vem em `img` (getImageProps) */}
          <img {...img} srcSet={mobileSrcSet} />
        </picture>
      </div>
      <div className={styles.heroVeu} />

      <div className={styles.heroConteudo}>
        <MonogramDG className={styles.heroMono} bold={10} />
        <p className={styles.sobre}>{hero.chamada}</p>
        <h1 id="hero-titulo" className={styles.nomes}>
          {first} <span className={styles.e}>&amp;</span> {second}
        </h1>
        <p className={styles.heroData} data-hero-date="">
          <i />
          <time dateTime={site.wedding.datetime}>{formatDotDate(site.wedding.datetime, tz)}</time>
          <i />
        </p>
        <p className={styles.heroLocal}>
          {site.ceremony.name}
          {city ? `, ${city}` : ""}
        </p>
      </div>

      <div className={styles.contador}>
        <Countdown
          target={site.wedding.datetime}
          title={hero.contador.titulo}
          todayMessage={hero.contador.hoje}
          afterMessage={preencher(hero.contador.depois, {
            data: formatWeddingDate(site.wedding.datetime, tz),
          })}
        />
      </div>
    </section>
  );
}
