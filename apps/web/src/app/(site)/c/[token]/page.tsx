import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Invitation } from "@casamento/shared";
import { ClosedSummary } from "@/components/rsvp/ClosedSummary";
import { ContactLinks } from "@/components/rsvp/ContactLinks";
import { RsvpForm } from "@/components/rsvp/RsvpForm";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SectionHeading } from "@/components/ui";
import { apiReadFresh } from "@/lib/api/client";
import { getSite } from "@/lib/api/site";
import { noindex } from "@/lib/seo";

export const metadata = noindex({
  title: "Confirmar presença",
  description: "Responda ao convite de Dani e Gustavo.",
});

/*
 * Página 100% por convidado (token na URL): não há casca estática útil. O menu
 * (usePathname) não pode ser pré-renderizado numa rota dinâmica, então a rota
 * aceita bloquear no pedido em vez de streamar a casca.
 */
export const instant = false;

export default function ConviteRoute({ params }: PageProps<"/c/[token]">) {
  return (
    <PageTransition>
      <SiteHeader band="laco" />
      <main id="conteudo" className="section-space flex-1">
        {/* `params` e a leitura do convite são dados de requisição: precisam ficar em <Suspense>. */}
        <Suspense fallback={<InvitationSkeleton />}>
          <InvitationView params={params} />
        </Suspense>
      </main>
    </PageTransition>
  );
}

async function InvitationView({ params }: { params: PageProps<"/c/[token]">["params"] }) {
  const { token } = await params;
  const [result, site] = await Promise.all([
    apiReadFresh(`/api/invitations/${encodeURIComponent(token)}`, Invitation),
    getSite(),
  ]);

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <div className="page-wrap page-grid gap-y-8">
        <div className="flex flex-col gap-6 lg:col-span-6 lg:col-start-2">
          <SectionHeading as="h1">Não conseguimos abrir o convite</SectionHeading>
          <p className="max-w-[56ch] text-lg text-tinta" role="alert">
            O servidor não respondeu. Recarregue a página em alguns instantes ou fale com os noivos.
          </p>
          <ContactLinks contact={site.contact} />
        </div>
      </div>
    );
  }

  const invitation = result.data;
  return (
    <div className="page-wrap page-grid gap-y-10">
      <div className="lg:col-span-6 lg:col-start-2">
        <SectionHeading
          as="h1"
          lead={
            invitation.isClosed
              ? undefined
              : "Diga quem vai. Leva um minuto, e dá para mudar depois."
          }
        >
          {invitation.label}
        </SectionHeading>
      </div>
      <div className="flex flex-col gap-8 lg:col-span-6 lg:col-start-2">
        {invitation.isClosed ? (
          <ClosedSummary invitation={invitation} contact={site.contact} />
        ) : (
          <RsvpForm token={token} invitation={invitation} />
        )}
        <p className="max-w-[56ch] text-sm text-tinta/70">
          Privacidade: guardamos presença, contato e restrições alimentares só para organizar a
          festa, e apagamos esses dados depois do casamento.
        </p>
      </div>
    </div>
  );
}

function InvitationSkeleton() {
  return (
    <div className="page-wrap page-grid gap-y-10" aria-busy="true">
      <div className="lg:col-span-6 lg:col-start-2">
        <p role="status" className="text-lg text-tinta/70">
          Abrindo o convite…
        </p>
      </div>
    </div>
  );
}
