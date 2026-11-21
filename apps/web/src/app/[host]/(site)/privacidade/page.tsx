import type { Metadata } from "next";
import { PRIVACY_NOTICE_SUMMARY } from "@casamento/shared";
import { PageTransition } from "@/components/site/PageTransition";
import { PrivacyRequestForm } from "@/components/site/PrivacyRequestForm";
import { SiteNav } from "@/components/site/SiteNav";
import { SectionHeading } from "@/components/ui";
import { getPrivacyNotice } from "@/lib/api/privacy";
import { getSite } from "@/lib/api/site";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Como os dados dos convidados são usados e como pedir para ver, corrigir ou apagar.",
};

const h2 = "titulo text-display-sm! m-0!";

/** "365" → "1 ano"; "730" → "2 anos"; senão em dias. */
function retentionText(days: number): string {
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "1 ano" : `${years} anos`;
  }
  return `${days} dias`;
}

/**
 * /privacidade (Fase 6, LGPD): o aviso de privacidade do evento (o mesmo aceito no RSVP e no
 * mural) e o formulário do titular. Existe com qualquer módulo ligado ou desligado.
 * TODO(conteudo): textos provisórios, a revisar com quem responde pela LGPD.
 */
export default async function PrivacidadePage() {
  const [site, notice] = await Promise.all([getSite(), getPrivacyNotice()]);
  const hosts = site.event.vocabulary.hosts;
  return (
    <PageTransition>
      <SiteNav site={site} current="/privacidade" />
      <main id="conteudo" className="below-nav section-space flex-1">
        <div className="page-wrap page-grid gap-y-12">
          <div className="flex flex-col gap-8 lg:col-span-7 lg:col-start-2">
            <SectionHeading as="h1" rotulo="Seus dados" lead={PRIVACY_NOTICE_SUMMARY}>
              Privacidade
            </SectionHeading>

            <section className="flex flex-col gap-4" aria-labelledby="priv-guardamos">
              <h2 id="priv-guardamos" className={h2}>
                O que guardamos
              </h2>
              <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-ink">
                <li>
                  Na confirmação de presença: nomes, quem vai, restrições alimentares (dado de
                  saúde, só para o buffet) e, se você informar, e-mail e telefone.
                </li>
                <li>No mural: o nome e o recado que você escrever.</li>
                <li>
                  Nos presentes: nome, e-mail e o recado de quem presenteia. O pagamento é feito
                  pelo provedor de pagamento; os dados do cartão não passam por aqui.
                </li>
              </ul>
            </section>

            <section className="flex flex-col gap-4" aria-labelledby="priv-tempo">
              <h2 id="priv-tempo" className={h2}>
                Por quanto tempo
              </h2>
              <p className="m-0 max-w-[60ch] text-ink">
                {notice.retentionDays
                  ? `Os dados pessoais são anonimizados ${retentionText(notice.retentionDays)} depois do evento. Ficam só os valores dos presentes, sem nome nem contato, que a contabilidade exige.`
                  : `Os dados ficam enquanto ${hosts} precisarem deles para o evento; você pode pedir para apagar a qualquer momento.`}
              </p>
            </section>

            <section className="flex flex-col gap-4" aria-labelledby="priv-quem">
              <h2 id="priv-quem" className={h2}>
                Quem responde
              </h2>
              <p className="m-0 max-w-[60ch] text-ink">
                Quem decide sobre os seus dados são {hosts}, que organizam {notice.eventName}. A
                plataforma do site só guarda e processa os dados em nome deles.
                {notice.contactEmail ? (
                  <>
                    {" "}
                    Contato:{" "}
                    <a
                      className="underline underline-offset-4"
                      href={`mailto:${notice.contactEmail}`}
                    >
                      {notice.contactEmail}
                    </a>
                    .
                  </>
                ) : null}
              </p>
            </section>

            <section className="flex flex-col gap-6" aria-labelledby="priv-pedido">
              <div className="flex flex-col gap-3">
                <h2 id="priv-pedido" className={h2}>
                  Ver, corrigir ou apagar
                </h2>
                <p className="m-0 max-w-[60ch] text-ink-soft">
                  Pela LGPD você pode pedir para ver os seus dados, corrigi-los ou apagá-los. Mande
                  o pedido por aqui.
                </p>
              </div>
              <PrivacyRequestForm />
            </section>

            <p className="m-0 text-sm text-ink-soft">Versão do aviso: {notice.version}.</p>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
