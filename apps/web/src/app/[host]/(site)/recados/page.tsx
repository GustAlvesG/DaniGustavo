import type { Metadata } from "next";
import { Enfase } from "@/components/album";
import { Mural } from "@/components/recados/Mural";
import { RecadoForm } from "@/components/recados/RecadoForm";
import styles from "@/components/recados/recados.module.css";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { SectionHeading } from "@/components/ui";
import { getContent, getSite } from "@/lib/api/site";
import { getWall } from "@/lib/api/messages";

export const metadata: Metadata = {
  title: "Mural de recados",
  description: "Mural de recados para os anfitriões.",
};

/**
 * /recados: o mural com os recados aprovados pelos noivos (cache de /api/e/<slug>/messages,
 * tag "messages:<id>") e o formulário para deixar um recado novo, que entra como pendente.
 */
export default async function RecadosPage() {
  const [site, wall, { paginas }] = await Promise.all([getSite(), getWall(), getContent()]);
  const t = paginas.recados;
  return (
    <PageTransition>
      <SiteNav site={site} current="/recados" />
      <main id="conteudo" className="below-nav flex-1">
        <div className="page-wrap section-space">
          <SectionHeading
            as="h1"
            id="recados-titulo"
            rotulo={t.rotulo}
            className="mx-auto mb-14 max-w-[640px] items-center text-center"
            lead={t.lead}
          >
            <Enfase texto={t.titulo} />
          </SectionHeading>

          {wall.messages.length ? (
            <Mural recados={wall.messages} timeZone={site.wedding.timezone} label={t.rotulo} />
          ) : (
            <p className={styles.vazio}>{wall.available ? t.vazio : t.indisponivel}</p>
          )}

          <div className="mt-16 sm:mt-20">
            <RecadoForm t={t} />
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
