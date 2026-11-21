import type { Metadata } from "next";
import { Enfase } from "@/components/album";
import { Mural } from "@/components/recados/Mural";
import { RecadoForm } from "@/components/recados/RecadoForm";
import styles from "@/components/recados/recados.module.css";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { SectionHeading } from "@/components/ui";
import { getSiteWithModule } from "@/lib/api/site";
import { getWall } from "@/lib/api/messages";
import { getPrivacyNotice } from "@/lib/api/privacy";

export const metadata: Metadata = {
  title: "Mural de recados",
  description: "Mural de recados para os anfitriões.",
};

/**
 * /recados: o mural com os recados aprovados pelos anfitriões (cache de
 * /api/e/<slug>/messages, tag "messages:<id>") e o formulário para deixar um recado novo, que
 * entra como pendente. Módulo de recados desligado → 404.
 */
export default async function RecadosPage() {
  const site = await getSiteWithModule("messages");
  const [wall, notice] = await Promise.all([getWall(), getPrivacyNotice()]);
  const t = site.sections.pages.messages;
  return (
    <PageTransition>
      <SiteNav site={site} current="/recados" />
      <main id="conteudo" className="below-nav flex-1">
        <div className="page-wrap section-space">
          <SectionHeading
            as="h1"
            id="recados-titulo"
            rotulo={t.label}
            className="mx-auto mb-14 max-w-[640px] items-center text-center"
            lead={t.lead || undefined}
          >
            <Enfase texto={t.title} />
          </SectionHeading>

          {wall.messages.length ? (
            <Mural recados={wall.messages} timeZone={site.wedding.timezone} label={t.label} />
          ) : (
            <p className={styles.vazio}>{wall.available ? t.empty : t.unavailable}</p>
          )}

          <div className="mt-16 sm:mt-20">
            <RecadoForm t={t} requireConsent={notice.requireConsent} />
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
