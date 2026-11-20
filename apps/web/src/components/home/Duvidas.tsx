import type { SiteContent } from "@casamento/shared";
import { Cabecalho } from "@/components/album";
import { ContactLinks } from "@/components/rsvp/ContactLinks";
import { cx } from "@/lib/cx";
import { Faq } from "./Faq";
import styles from "./home.module.css";

/** Dúvidas: perguntas e respostas do banco, num acordeão, e o contato dos anfitriões. */
export function Duvidas({ site, pagina }: { site: SiteContent; pagina?: number }) {
  const { faq: duvidas } = site.sections;
  return (
    <section className={styles.sec} id="duvidas" aria-labelledby="duvidas-titulo">
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="duvidas-titulo"
          pagina={pagina}
          rotulo={duvidas.label}
          titulo={duvidas.title}
          lead={duvidas.lead || undefined}
        />
        <div className={cx(styles.faqLista, "rv")}>
          <Faq items={site.faq} />
        </div>
        <div className={cx(styles.contato, "rv")}>
          <p className="m-0">{site.contact.message}</p>
          <div className="mt-2 flex justify-center">
            <ContactLinks contact={site.contact} />
          </div>
        </div>
      </div>
    </section>
  );
}
