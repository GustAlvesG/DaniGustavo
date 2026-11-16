import { ContactLinks } from "@/components/rsvp/ContactLinks";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Tile } from "@/components/tiles";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { getSite } from "@/lib/api/site";
import { noindex } from "@/lib/seo";

export const metadata = noindex({ title: "Convite não encontrado" });

/** `notFound()` em /c/[token]: link errado, incompleto ou convite apagado. */
export default async function ConviteNaoEncontrado() {
  const { contact } = await getSite();
  return (
    <PageTransition>
      <SiteHeader band="laco" />
      <main id="conteudo" className="section-space flex-1">
        <div className="page-wrap page-grid gap-y-10">
          <div className="flex flex-col gap-8 lg:col-span-6 lg:col-start-2">
            <Tile design="ramo" size={72} rotate={90} />
            <SectionHeading
              as="h1"
              lead="Esse link não abre nenhum convite. Pode ter faltado um pedaço quando foi copiado. Busque pelo seu nome ou fale com os noivos."
            >
              Convite não encontrado
            </SectionHeading>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/confirmar" size="lg">
                Buscar pelo nome
              </ButtonLink>
            </div>
            <ContactLinks contact={contact} />
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
