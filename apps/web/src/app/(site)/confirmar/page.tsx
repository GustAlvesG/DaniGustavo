import { FormCard } from "@/components/rsvp/FormCard";
import { LookupForm } from "@/components/rsvp/LookupForm";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SectionHeading } from "@/components/ui";
import { getSite } from "@/lib/api/site";
import { noindex } from "@/lib/seo";
import { formatDayMonth } from "@/lib/site";

export const metadata = noindex({
  title: "Confirmar presença",
  description: "Encontre o seu convite pelo nome e confirme a presença.",
});

export default async function ConfirmarPage() {
  const site = await getSite();
  return (
    <PageTransition>
      <SiteHeader band="laco" />
      <main id="conteudo" className="section-space flex-1" data-rsvp="">
        <div className="page-wrap page-grid gap-y-12">
          <div className="lg:col-span-5 lg:pt-16">
            <SectionHeading
              as="h1"
              lead={`Digite seu nome como está no convite. Responda até ${formatDayMonth(site.rsvp.deadline)}.`}
            >
              Confirmar presença
            </SectionHeading>
          </div>
          <FormCard className="lg:col-span-6 lg:col-start-7">
            <LookupForm contact={site.contact} />
          </FormCard>
        </div>
      </main>
    </PageTransition>
  );
}
