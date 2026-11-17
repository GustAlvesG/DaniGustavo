"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./nav.module.css";

/**
 * A data no menu. Na home ela só aparece quando a data do hero
 * (`[data-hero-date]`) passa por baixo do menu: um IntersectionObserver
 * (o navegador avisa quando o elemento entra ou sai da área visível, sem
 * ouvir cada evento de rolagem) liga e desliga `data-shown`, e o CSS faz o
 * fade. Nas páginas internas (`always`) ela fica sempre lá.
 *
 * O menu não muda de altura: a data ocupa um espaço que já existe.
 */
export function NavDate({ long, short, always }: { long: string; short: string; always: boolean }) {
  const [shown, setShown] = useState(always);

  useEffect(() => {
    if (always) return;
    const target = document.querySelector("[data-hero-date]");
    if (!target) return;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"));
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Fora da área visível e acima dela (já rolou): mostra no menu.
        setShown(!entry.isIntersecting && entry.boundingClientRect.top < (navH || 72));
      },
      { rootMargin: `-${navH || 72}px 0px 0px 0px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [always]);

  return (
    <p className={cx(styles.date)} data-shown={shown ? "" : undefined} data-nav-date="">
      <span className={styles.dateLong}>{long}</span>
      <span className={styles.dateShort}>{short}</span>
    </p>
  );
}
