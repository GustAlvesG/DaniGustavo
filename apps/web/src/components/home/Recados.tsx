import { Cabecalho } from "@/components/album";
import { Mural } from "@/components/recados/Mural";
import recados from "@/components/recados/recados.module.css";
import { ButtonLink } from "@/components/ui";
import type { SiteContent } from "@casamento/shared";
import type { Wall } from "@/lib/api/messages";
import styles from "./home.module.css";

/**
 * Recados: os últimos bilhetes aprovados e os caminhos para o mural inteiro e para o
 * formulário. Sem recado aprovado ainda, convida a escrever o primeiro.
 */
export function Recados({
  site,
  wall,
  pagina,
}: {
  site: SiteContent;
  wall: Wall;
  pagina?: number;
}) {
  const t = site.sections.messages;
  const ultimos = wall.messages.slice(0, t.count);
  return (
    <section className={styles.sec} id="recados" aria-labelledby="recados-titulo">
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="recados-titulo"
          pagina={pagina}
          rotulo={t.label}
          titulo={t.title}
          lead={t.lead || undefined}
        />
        {ultimos.length ? (
          <Mural
            recados={ultimos}
            timeZone={site.wedding.timezone}
            layout="fileira"
            label={t.label}
          />
        ) : (
          <p className={recados.vazio}>{t.empty}</p>
        )}
        <div className={recados.acoes}>
          {ultimos.length ? (
            <ButtonLink href="/recados" variant="primary">
              {t.seeAll}
            </ButtonLink>
          ) : null}
          <ButtonLink href="/recados#escrever" variant={ultimos.length ? "secondary" : "primary"}>
            {t.write}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
