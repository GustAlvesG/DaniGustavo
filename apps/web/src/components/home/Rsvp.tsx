import type { SiteContent } from "@casamento/shared";
import { Cabecalho, Polaroid } from "@/components/album";
import { Monograma } from "@/components/brand";
import { ButtonLink } from "@/components/ui";
import { cx } from "@/lib/cx";
import { fillSiteText, formatDotDate } from "@/lib/site";
import styles from "./home.module.css";

/**
 * Confirmação de presença, na seção marinho. A resposta de verdade é por
 * convite: este cartão-resposta só leva a /confirmar (busca pelo nome), onde
 * o convidado acha o próprio convite e responde por todos de uma vez.
 */
export function Rsvp({
  site,
  iniciais,
  pagina,
}: {
  site: SiteContent;
  iniciais: string | null;
  pagina?: number;
}) {
  const { rsvp } = site.sections;
  const tz = site.wedding.timezone;
  const deadline = site.rsvp.deadline;
  return (
    <section
      className={cx(styles.sec, "surface-marinho overflow-hidden")}
      id="rsvp"
      aria-labelledby="rsvp-titulo"
    >
      <div className={styles.rsvpGrid}>
        <div className={styles.rsvpIntro}>
          <Cabecalho
            id="rsvp-titulo"
            alinhamento="esquerda"
            fios="um"
            pagina={pagina}
            rotulo={rsvp.label}
            titulo={rsvp.title}
          />
          {rsvp.text ? <p className="rv d2">{fillSiteText(rsvp.text, site)}</p> : null}
          <div className={styles.rsvpFotos} aria-hidden="true">
            {rsvp.photos.slice(0, 2).map((f, i) => (
              <Polaroid
                key={f.src + i}
                as="div"
                foto={{ ...f, alt: "" }}
                sizes="240px"
                className={i ? "r4 assenta-d" : "r1 assenta"}
              />
            ))}
          </div>
        </div>

        <div className={cx("cartao-resp surface-papel de-dir", styles.cartaoResp)}>
          <Monograma iniciais={iniciais} className={styles.cartaoMono} bold={10} />
          <h3>{rsvp.card.title}</h3>
          <p className={styles.prazo}>Até {formatDotDate(deadline, tz)}</p>
          <p className={styles.convite}>{fillSiteText(rsvp.card.text, site)}</p>
          <ButtonLink href="/confirmar" size="lg" block>
            {rsvp.card.button}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
