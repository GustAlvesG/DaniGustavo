import { Cabecalho } from "@/components/album";
import { Mural } from "@/components/recados/Mural";
import recados from "@/components/recados/recados.module.css";
import { ButtonLink } from "@/components/ui";
import type { HomeContent } from "@/content/home";
import type { Wall } from "@/lib/api/messages";
import styles from "./home.module.css";

/**
 * Recados: os últimos bilhetes aprovados e os caminhos para o mural inteiro e para o
 * formulário. Sem recado aprovado ainda, convida a escrever o primeiro.
 */
export function Recados({
  home,
  wall,
  timeZone,
  pagina,
}: {
  home: HomeContent;
  wall: Wall;
  timeZone: string;
  pagina?: number;
}) {
  const t = home.recados;
  const ultimos = wall.messages.slice(0, t.quantidade);
  return (
    <section className={styles.sec} id="recados" aria-labelledby="recados-titulo">
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="recados-titulo"
          pagina={pagina}
          rotulo={t.rotulo}
          titulo={t.titulo}
          lead={t.lead}
        />
        {ultimos.length ? (
          <Mural recados={ultimos} timeZone={timeZone} layout="fileira" label={t.rotulo} />
        ) : (
          <p className={recados.vazio}>{t.vazio}</p>
        )}
        <div className={recados.acoes}>
          {ultimos.length ? (
            <ButtonLink href="/recados" variant="primary">
              {t.verMural}
            </ButtonLink>
          ) : null}
          <ButtonLink href="/recados#escrever" variant={ultimos.length ? "secondary" : "primary"}>
            {t.escrever}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
