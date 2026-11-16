import Image from "next/image";
import type { StoryMoment } from "@casamento/shared";
import { cx } from "@/lib/cx";
import { StoryScroll } from "./StoryScroll";
import styles from "./story.module.css";

/**
 * Nossa história (PROMPT §4.6.2). Server Component: os momentos vêm no HTML.
 *
 * - Desktop: a seção fica fixada (pin) e a trilha corre na horizontal; uma
 *   única linha de tinta serenity se desenha ligando os anos (scrub).
 * - Celular: coluna vertical; a mesma linha desce pela coluna.
 * - Movimento reduzido ou sem JS: vertical, sem pin, linha inteira.
 *
 * O layout horizontal é decidido por CSS (media query), não por JS: nada
 * pula na hidratação. A ilha `StoryScroll` só liga o GSAP quando a seção se
 * aproxima da tela.
 */
export function Story({ moments }: { moments: StoryMoment[] }) {
  return (
    <section id="historia" aria-labelledby="historia-titulo" className={styles.section}>
      <div className={styles.viewport} data-story-viewport="">
        <div className={styles.track} data-story-track="">
          <svg className={styles.line} aria-hidden="true" focusable="false" data-story-svg="">
            <path data-story-line="" pathLength={1} />
          </svg>

          <header className={styles.intro}>
            <h2 id="historia-titulo" className="font-display text-display-md text-ink">
              Nossa história
            </h2>
            {/* TODO(conteudo): frase de abertura escrita pelo casal. */}
            <p className="mt-6 max-w-[30ch] text-lg text-ink-soft">
              Alguns momentos até aqui. O próximo é com você lá.
            </p>
            <p className={cx(styles.hint, "text-sm text-ink-soft")} aria-hidden="true">
              Role para seguir a linha
            </p>
          </header>

          <ol className={styles.moments}>
            {moments.map((m, i) => (
              <li key={m.id} className={styles.moment} data-side={i % 2 ? "low" : "high"}>
                <figure className={styles.figure}>
                  <Image
                    src={m.image}
                    alt={m.imageAlt}
                    width={800}
                    height={1000}
                    sizes="(min-width: 1024px) 22vw, 100vw"
                    className={styles.image}
                  />
                </figure>
                <div className={styles.text}>
                  <p className={styles.year}>
                    <span className={styles.dot} data-story-dot="" aria-hidden="true" />
                    <span className="font-display text-display-md text-ink">{m.when}</span>
                  </p>
                  <h3 className="mt-4 text-xl font-medium text-ink">{m.title}</h3>
                  <p className="mt-2 max-w-[34ch] text-base text-ink-soft">{m.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <StoryScroll />
    </section>
  );
}
