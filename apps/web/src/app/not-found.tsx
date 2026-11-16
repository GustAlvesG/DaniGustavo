import { MonogramDG } from "@/components/brand";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ButtonLink, SectionHeading } from "@/components/ui";

/** 404 do site (rotas que não existem e `notFound()` fora de /c/[token]). */
export default function NotFound() {
  return (
    <>
      <SiteHeader band="onda" />
      <main id="conteudo" className="section-space flex-1">
        <div className="page-wrap page-grid items-center gap-y-14">
          <div className="flex flex-col gap-10 lg:col-span-6">
            <SectionHeading
              as="h1"
              lead="Esse endereço não existe no site. Confira o link ou volte para o início."
            >
              Página não encontrada
            </SectionHeading>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/" size="lg">
                Voltar ao início
              </ButtonLink>
              <ButtonLink href="/confirmar" size="lg" variant="secondary">
                Confirmar presença
              </ButtonLink>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="card-marinho shape-arch mx-auto hidden aspect-[3/4] w-full max-w-[17rem] place-items-center [--arch-rise:37.5%] lg:col-span-4 lg:col-start-9 lg:grid"
          >
            <MonogramDG bold={6} className="w-[62%] text-ink" />
          </div>
        </div>
      </main>
    </>
  );
}
