import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { OrderView } from "@casamento/shared";
import { Polaroid } from "@/components/album";
import { OrderSummary } from "@/components/presentes/OrderSummary";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { home } from "@/content/home";
import { apiReadFresh } from "@/lib/api/client";
import { getSite } from "@/lib/api/site";
import { firstName } from "@/lib/presentes";
import { noindex } from "@/lib/seo";

export const metadata = noindex({
  title: "Presente enviado",
  description: "Obrigado pelo presente.",
});

export const instant = false;

export default async function ObrigadoRoute({
  params,
}: PageProps<"/presentes/obrigado/[publicId]">) {
  const site = await getSite();
  return (
    <PageTransition>
      <SiteNav site={site} current="/presentes" />
      <main id="conteudo" className="below-nav section-space flex-1" data-thanks="">
        <Suspense fallback={<p className="page-wrap text-lg text-ink-soft">Carregando…</p>}>
          <Obrigado params={params} />
        </Suspense>
      </main>
    </PageTransition>
  );
}

async function Obrigado({
  params,
}: {
  params: PageProps<"/presentes/obrigado/[publicId]">["params"];
}) {
  const { publicId } = await params;
  const result = await apiReadFresh(`/api/orders/${encodeURIComponent(publicId)}`, OrderView);
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
    <div className="page-wrap page-grid items-start gap-y-14">
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
      <div className="relative flex flex-col gap-12 lg:col-span-5 lg:col-start-8">
        <OrderSummary order={order} className="r6" />
        <Polaroid
          foto={home.presentes.foto}
          sizes="240px"
          legenda={home.presentes.legendaFoto}
          className="r1 mx-auto w-[220px] lg:absolute lg:-top-28 lg:-right-8 lg:w-[170px]"
        />
      </div>
    </div>
  );
}
