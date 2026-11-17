import type { Metadata } from "next";
import { GiftList } from "@/components/presentes/GiftList";
import { ContactLinks } from "@/components/rsvp/ContactLinks";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { SectionHeading } from "@/components/ui";
import { getGifts } from "@/lib/api/gifts";
import { getSite } from "@/lib/api/site";

export const metadata: Metadata = {
  title: "Lista de presentes",
  description:
    "Presentes para a casa nova e para a lua de mel de Dani e Gustavo, no Pix ou no cartão.",
};

/**
 * /presentes: a lista vem do cache de `/api/gifts` (30 s, tag "gifts"), então
 * a página sai pré-renderizada; os filtros rodam no navegador.
 */
export default async function PresentesPage() {
  const [site, list] = await Promise.all([getSite(), getGifts()]);
  return (
    <PageTransition>
      <SiteNav site={site} current="/presentes" />
      <main id="conteudo" className="below-nav flex-1">
        <div className="page-wrap section-space">
          <SectionHeading
            as="h1"
            rotulo="Lista de presentes"
            className="mx-auto mb-14 max-w-[640px] items-center text-center"
            lead="Presença é o que mais importa. Se quiser nos presentear, escolha um item para a casa ou para a lua de mel, ou contribua com o valor que quiser."
          >
            Um presente <em>para nós dois</em>
          </SectionHeading>

          {list.available ? (
            <GiftList
              gifts={list.gifts}
              categories={list.categories}
              requiresCpf={list.requiresCpf}
            />
          ) : (
            <div
              className="mx-auto flex max-w-[56ch] flex-col items-center gap-4 text-center"
              role="alert"
            >
              <p className="text-lg">
                A lista não carregou agora. Recarregue a página em alguns instantes ou fale com a
                gente.
              </p>
              <ContactLinks contact={site.contact} />
            </div>
          )}

          <p className="mx-auto mt-20 max-w-[56ch] text-center text-ink-soft italic">
            O pagamento é feito aqui mesmo, por Pix ou cartão. Você recebe o comprovante por e-mail.
          </p>
        </div>
      </main>
    </PageTransition>
  );
}
