import { Cabecalho, Polaroid } from "@/components/album";
import { ButtonLink } from "@/components/ui";
import { home } from "@/content/home";
import { cx } from "@/lib/cx";
import styles from "./home.module.css";

/** Presentes: cartão de fio duplo com uma polaroid e a chamada para a lista. */
export function Presentes({ pagina }: { pagina?: number }) {
  const { presentes } = home;
  return (
    <section className={styles.sec} id="presentes" aria-labelledby="presentes-titulo">
      <div className={cx(styles.presentesBox, "rv")}>
        <Polaroid
          foto={presentes.foto}
          sizes="300px"
          legenda={presentes.legendaFoto}
          className={cx(styles.presentesFoto, "r1 assenta-d")}
        />
        <div>
          <Cabecalho
            id="presentes-titulo"
            alinhamento="esquerda"
            fios="um"
            revelar={false}
            pagina={pagina}
            rotulo={presentes.rotulo}
            titulo={presentes.titulo}
          />
          <p className={styles.presentesTexto}>{presentes.texto}</p>
          {presentes.botoes.length ? (
            <div className={styles.acoes}>
              {presentes.botoes.map((b, i) => (
                <ButtonLink key={b.link} href={b.link} variant={i ? "secondary" : "primary"}>
                  {b.texto}
                </ButtonLink>
              ))}
            </div>
          ) : (
            <p className={styles.aviso}>{presentes.aviso}</p>
          )}
        </div>
      </div>
    </section>
  );
}
