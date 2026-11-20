import type { CSSProperties } from "react";
import { getImageProps } from "next/image";
import type { Photo, SiteContent } from "@casamento/shared";
import { Monograma } from "@/components/brand";
import { Countdown } from "@/components/countdown";
import { cityFromAddress, fillSiteText, formatDotDate, splitCoupleNames } from "@/lib/site";
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
export function Hero({ site, iniciais }: { site: SiteContent; iniciais: string | null }) {
  const { hero } = site.sections;
  const vocab = site.event.vocabulary;
  // Texto vazio no editor = o do vocabulário do tipo de evento.
  const countdown = {
    title: hero.countdown.title || vocab.countdownTitle,
    today: hero.countdown.today || vocab.countdownToday,
    after: hero.countdown.after || vocab.countdownAfter,
  };
  const desktopFoto = hero.photoDesktop ?? hero.photoMobile;
  const mobileFoto = hero.photoMobile ?? hero.photoDesktop;
  const { first, second } = splitCoupleNames(site.couple.names);
  const tz = site.wedding.timezone;
  const city = cityFromAddress(site.ceremony.address).split(",")[0];

  const fotos = heroPicture(desktopFoto, mobileFoto);
  return (
    <section
      className={styles.hero}
      id="inicio"
      aria-labelledby="hero-titulo"
      // Parte visível de cada foto quando cortada (posição escolhida no editor).
      style={
        {
          "--pos-celular": mobileFoto?.position ?? "center",
          "--pos-desktop": desktopFoto?.position ?? "center",
        } as CSSProperties
      }
    >
      {/* Sem foto: fica o fundo marinho do hero. */}
      <div className={styles.heroBg}>
        {fotos ? (
          <picture>
            <source media="(min-width: 701px)" srcSet={fotos.desktopSrcSet} sizes="100vw" />
            {/* eslint-disable-next-line jsx-a11y/alt-text -- o alt vem em `img` (getImageProps) */}
            <img {...fotos.img} />
          </picture>
        ) : null}
      </div>
      <div className={styles.heroVeu} />

      <div className={styles.heroConteudo}>
        <Monograma iniciais={iniciais} className={styles.heroMono} bold={10} />
        <p className={styles.sobre}>{hero.kicker || vocab.heroKicker}</p>
        <h1 id="hero-titulo" className={styles.nomes}>
          {second ? (
            <>
              {first} <span className={styles.e}>&amp;</span> {second}
            </>
          ) : (
            first
          )}
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
          title={fillSiteText(countdown.title, site)}
          todayMessage={fillSiteText(countdown.today, site)}
          afterMessage={fillSiteText(countdown.after, site)}
        />
      </div>
    </section>
  );
}

/**
 * Foto diferente no celular e no computador ("art direction"): `getImageProps` dá as URLs
 * otimizadas do next/image sem renderizar um <Image>, para montar o <picture> à mão.
 */
function heroPicture(desktop: Photo | null, mobile: Photo | null) {
  if (!desktop || !mobile) return null;
  const common = { alt: mobile.alt, sizes: "100vw", quality: 75 } as const;
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
  return { desktopSrcSet, img: { ...img, srcSet: mobileSrcSet } };
}
