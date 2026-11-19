import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { OrderView } from "@casamento/shared";
import { OrderSummary } from "@/components/presentes/OrderSummary";
import { PaymentPanel } from "@/components/presentes/PaymentPanel";
import { FormCard } from "@/components/rsvp/FormCard";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { SectionHeading } from "@/components/ui";
import { apiReadFresh } from "@/lib/api/client";
import { getSite } from "@/lib/api/site";
import { noindex } from "@/lib/seo";

export const metadata = noindex({
  title: "Pagamento do presente",
  description: "Pague o presente de Dani e Gustavo com Pix ou cartão.",
});

/* Página por pedido (id na URL), sem casca estática útil: bloqueia no pedido. */
export const instant = false;

export default async function PagamentoRoute({
  params,
}: PageProps<"/presentes/pagamento/[publicId]">) {
  const site = await getSite();
  return (
    <PageTransition>
      <SiteNav site={site} current="/presentes" />
      <main id="conteudo" className="below-nav flex-1" data-payment="">
        <div className="section-space">
          {/* O pedido é dado de requisição: fica em <Suspense> (cacheComponents). */}
          <Suspense fallback={<Loading />}>
            <Pagamento params={params} timezone={site.wedding.timezone} />
          </Suspense>
        </div>
      </main>
    </PageTransition>
  );
}

async function Pagamento({
  params,
  timezone,
}: {
  params: PageProps<"/presentes/pagamento/[publicId]">["params"];
  timezone: string;
}) {
  const { publicId } = await params;
  const result = await apiReadFresh(`/api/orders/${encodeURIComponent(publicId)}`, OrderView);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="page-wrap">
        <p className="text-lg" role="alert">
          Não conseguimos abrir o pagamento agora. Recarregue a página em alguns instantes.
        </p>
      </div>
    );
  }
  const order = result.data;
  if (order.status === "paid") redirect(`/presentes/obrigado/${order.publicId}`);

  const until = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(order.expiresAt));

  return (
    <div className="page-wrap page-grid gap-y-12">
      <div className="flex flex-col gap-10 lg:col-span-5 lg:pt-10">
        <SectionHeading
          as="h1"
          rotulo="Pagamento"
          lead={
            order.status === "pending"
              ? `Pague com Pix ou cartão. Seu presente fica reservado até ${until}.`
              : undefined
          }
        >
          Falta <em>pouco</em>
        </SectionHeading>
        <OrderSummary order={order} className="r3 max-w-[420px]" />
      </div>
      <FormCard className="lg:col-span-6 lg:col-start-7">
        <PaymentPanel order={order} />
      </FormCard>
    </div>
  );
}

function Loading() {
  return (
    <div className="page-wrap" aria-busy="true">
      <p role="status" className="text-lg text-ink-soft">
        Abrindo o pagamento…
      </p>
    </div>
  );
}
