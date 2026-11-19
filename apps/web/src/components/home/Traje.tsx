import type { SiteContent } from "@casamento/shared";
import { Cabecalho, FotoImg } from "@/components/album";
import type { HomeContent } from "@/content/home";
import { cx } from "@/lib/cx";
import styles from "./home.module.css";

const DELAYS = ["d1", "d2", "d2", "d3"];

/** Traje: foto no arco e, ao lado, a paleta e o que evitar (do banco). */
export function Traje({
  home,
  site,
  pagina,
}: {
  home: HomeContent;
  site: SiteContent;
  pagina?: number;
}) {
  const { traje } = home;
  const { palette, avoid } = site.dressCode;
  return (
    <section className={cx(styles.sec, "surface-areia")} id="traje" aria-labelledby="traje-titulo">
      <div className={cx(styles.wrap, styles.trajeGrid)}>
        {traje.foto ? (
          <figure className="arco r3 assenta">
            <div className={styles.arcoFoto}>
              <FotoImg foto={traje.foto} sizes="(max-width: 860px) 330px, 430px" fill />
            </div>
          </figure>
        ) : null}
        <div>
          <Cabecalho
            id="traje-titulo"
            alinhamento="esquerda"
            fios="um"
            pagina={pagina}
            rotulo={traje.rotulo}
            titulo={traje.titulo}
            lead={traje.lead || site.dressCode.text || undefined}
          />
          {palette.length ? (
            <ul className={styles.paleta} aria-label="Cores sugeridas">
              {palette.map((c, i) => (
                <li key={c.hex + c.name} className={cx("rv", DELAYS[i % DELAYS.length])}>
                  <span className={styles.chip} style={{ background: c.hex }} aria-hidden="true" />
                  <b>{c.name}</b>
                  <small>{c.hex.toUpperCase()}</small>
                </li>
              ))}
            </ul>
          ) : null}
          {avoid.length ? (
            <div className={cx(styles.evitar, "rv d3")}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M5.6 18.4L18.4 5.6" />
              </svg>
              <div>
                <b>Evite:</b>
                <ul>
                  {avoid.map((a) => (
                    <li key={a}>{a}.</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
