import type { SiteContent } from "@casamento/shared";
import { Cabecalho, Polaroid } from "@/components/album";
import { cx } from "@/lib/cx";
import styles from "./home.module.css";

/**
 * Nossa história: polaroids coladas em zigue-zague, cada uma com ano,
 * título e uma frase. Elas "assentam" no álbum ao entrar na tela (giram e
 * sobem até a inclinação final), alternando o lado.
 */
export function Historia({ site, pagina }: { site: SiteContent; pagina?: number }) {
  const { story } = site.sections;
  return (
    <section className={styles.sec} id="historia" aria-labelledby="historia-titulo">
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="historia-titulo"
          pagina={pagina}
          rotulo={story.label}
          titulo={story.title}
          lead={story.lead || undefined}
        />
        <ol className={styles.historiaGrid}>
          {story.items.map((m, i) => (
            <li key={i} className={styles.momento}>
              {m.photo ? (
                <Polaroid
                  foto={m.photo}
                  sizes="(max-width: 620px) 45vw, (max-width: 1000px) 30vw, 210px"
                  sobre={m.year}
                  legenda={m.title}
                  className={cx(`r${(i % 6) + 1}`, i % 2 ? "assenta-d" : "assenta")}
                />
              ) : (
                <p className="legenda rv">
                  {m.year ? <b>{m.year}</b> : null} {m.title}
                </p>
              )}
              <p className="rv d2">{m.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
