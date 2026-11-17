import { Cabecalho, Polaroid } from "@/components/album";
import { home } from "@/content/home";
import { cx } from "@/lib/cx";
import styles from "./home.module.css";

/**
 * Nossa história: polaroids coladas em zigue-zague, cada uma com ano,
 * título e uma frase. Elas "assentam" no álbum ao entrar na tela (giram e
 * sobem até a inclinação final), alternando o lado.
 */
export function Historia({ pagina }: { pagina?: number }) {
  const { historia } = home;
  return (
    <section className={styles.sec} id="historia" aria-labelledby="historia-titulo">
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="historia-titulo"
          pagina={pagina}
          rotulo={historia.rotulo}
          titulo={historia.titulo}
          lead={historia.lead}
        />
        <ol className={styles.historiaGrid}>
          {historia.momentos.map((m, i) => (
            <li key={m.ano + m.titulo} className={styles.momento}>
              <Polaroid
                foto={m.foto}
                sizes="(max-width: 620px) 45vw, (max-width: 1000px) 30vw, 210px"
                sobre={m.ano}
                legenda={m.titulo}
                className={cx(`r${(i % 6) + 1}`, i % 2 ? "assenta-d" : "assenta")}
              />
              <p className="rv d2">{m.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
