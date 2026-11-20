import { Cabecalho, Polaroid } from "@/components/album";
import { ButtonLink } from "@/components/ui";
import type { SiteContent } from "@casamento/shared";
import { cx } from "@/lib/cx";
import { fillSiteText, linkAvailable } from "@/lib/site";
import styles from "./home.module.css";

/** Presentes: cartão de fio duplo com uma polaroid e a chamada para a lista. */
export function Presentes({ site, pagina }: { site: SiteContent; pagina?: number }) {
  const { gifts: presentes } = site.sections;
  const buttons = presentes.buttons.filter((b) => linkAvailable(site, b.link));
  return (
    <section className={styles.sec} id="presentes" aria-labelledby="presentes-titulo">
      <div className={cx(styles.presentesBox, "rv")}>
        {presentes.photo ? (
          <Polaroid
            foto={presentes.photo}
            sizes="300px"
            legenda={presentes.photoCaption || undefined}
            className={cx(styles.presentesFoto, "r1 assenta-d")}
          />
        ) : null}
        <div>
          <Cabecalho
            id="presentes-titulo"
            alinhamento="esquerda"
            fios="um"
            revelar={false}
            pagina={pagina}
            rotulo={presentes.label}
            titulo={presentes.title}
          />
          {presentes.text ? (
            <p className={styles.presentesTexto}>{fillSiteText(presentes.text, site)}</p>
          ) : null}
          {buttons.length ? (
            <div className={styles.acoes}>
              {buttons.map((b, i) => (
                <ButtonLink key={b.link} href={b.link} variant={i ? "secondary" : "primary"}>
                  {b.text}
                </ButtonLink>
              ))}
            </div>
          ) : presentes.notice ? (
            <p className={styles.aviso}>{presentes.notice}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
