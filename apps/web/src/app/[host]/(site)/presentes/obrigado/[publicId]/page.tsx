import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { OrderView } from "@casamento/shared";
import { Polaroid } from "@/components/album";
import { OrderSummary } from "@/components/presentes/OrderSummary";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { apiReadFresh } from "@/lib/api/client";
import { currentEvent, eventPath } from "@/lib/api/event";
import { getContent, getSite } from "@/lib/api/site";
import { firstName } from "@/lib/presentes";
import { noindex } from "@/lib/seo";

export const metadata = noindex({
  title: "Presente enviado",
  description: "Obrigado pelo presente.",
});

export const instant = false;

export default async function ObrigadoRoute({
  params,
}: PageProps<"/[host]/presentes/obrigado/[publicId]">) {
  const site = await getSite();
  return (
    <PageTransition>
      <SiteNav site={site} current="/presentes" />
      <main id="conteudo" className="below-nav flex-1" data-thanks="">
        <div className="section-space">
          <Suspense fallback={<p className="page-wrap text-lg text-ink-soft">Carregando…</p>}>
            <Obrigado params={params} />
          </Suspense>
        </div>
      </main>
    </PageTransition>
  );
}

async function Obrigado({
  params,
}: {
  params: PageProps<"/[host]/presentes/obrigado/[publicId]">["params"];
}) {
  const { publicId } = await params;
  const ev = await currentEvent();
  const [result, { home }] = await Promise.all([
    apiReadFresh(eventPath(ev, `/orders/${encodeURIComponent(publicId)}`), OrderView),
    getContent(ev),
  ]);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <p className="page-wrap text-lg" role="alert">
        Não conseguimos abrir o comprovante agora. Recarregue a página em alguns instantes.
      </p>
    );
  }
  const order = result.data;
  // Ainda não pago (ou expirado): a tela de pagamento explica o que fazer.
  if (order.status !== "paid") redirect(`/presentes/pagamento/${order.publicId}`);

  return (
    <div className="page-wrap page-grid items-start gap-y-14 lg:gap-y-8">
      <div className="flex flex-col gap-8 lg:col-span-6 lg:pt-10">
        <SectionHeading
          as="h1"
          rotulo="Obrigado"
          lead={`Obrigado, ${firstName(order.buyerName)}. Recebemos o seu presente e o comprovante já está a caminho do seu e-mail.`}
        >
          Presente <em>enviado</em>
        </SectionHeading>
        <div className="flex flex-wrap items-center gap-4">
          <ButtonLink href="/presentes" variant="secondary">
            Voltar à lista de presentes
          </ButtonLink>
          <ButtonLink href="/" variant="quiet">
            Ir para o início
          </ButtonLink>
        </div>
      </div>
      <OrderSummary order={order} className="r6 lg:col-span-5 lg:col-start-8 lg:row-span-2" />
      {/* Celular: depois do resumo. Desktop: na coluna do título, abaixo dos botões. */}
      {home.presentes.foto ? (
        <Polaroid
          foto={home.presentes.foto}
          sizes="240px"
          legenda={home.presentes.legendaFoto}
          className="r1 mx-auto w-[220px] lg:col-span-4 lg:col-start-2 lg:row-start-2 lg:mx-0 lg:w-[210px]"
        />
      ) : null}
    </div>
  );
}
