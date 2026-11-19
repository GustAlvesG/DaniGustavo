import type { SiteContent } from "@casamento/shared";
import { Cabecalho } from "@/components/album";
import type { HomeContent } from "@/content/home";
import { cx } from "@/lib/cx";
import styles from "./home.module.css";

/**
 * Programação: linha do tempo vertical que se desenha com a rolagem
 * (`animation-timeline: view()` em home.module.css), com um ponto por
 * horário. Horário de um lado, cartão do outro, alternando.
 */
export function Programacao({
  home,
  site,
  pagina,
}: {
  home: HomeContent;
  site: SiteContent;
  pagina?: number;
}) {
  const { programacao } = home;
  return (
    <section className={styles.sec} id="programacao" aria-labelledby="programacao-titulo">
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="programacao-titulo"
          pagina={pagina}
          rotulo={programacao.rotulo}
          titulo={programacao.titulo}
          lead={programacao.lead}
        />
        <div className={styles.tl}>
          <div className={styles.tlLinha} aria-hidden="true" data-timeline-line="" />
          <ol className="m-0 list-none p-0">
            {site.schedule.map((item, i) => {
              const inv = i % 2 === 1;
              return (
                <li key={item.time + item.title} className={cx(styles.tlItem, inv && styles.inv)}>
                  <p className={cx(styles.tlHora, inv ? "de-dir" : "de-esq")}>{item.time}</p>
                  <span className={styles.tlPonto} aria-hidden="true" />
                  <div className={cx("cartao", styles.tlTxt, inv ? "de-esq" : "de-dir")}>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
