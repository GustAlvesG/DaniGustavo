import { Polaroid } from "@/components/album";
import { SiteNav } from "@/components/site/SiteNav";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { paginas } from "@/content/paginas";
import { getSite } from "@/lib/api/site";

/** 404 do site (rotas que não existem e `notFound()` fora de /c/[token]). */
export default async function NotFound() {
  const site = await getSite();
  const { naoEncontrada } = paginas;
  return (
    <>
      <SiteNav site={site} />
      <main id="conteudo" className="below-nav flex-1">
        <div className="page-wrap page-grid section-space items-center gap-y-14">
          <div className="flex flex-col gap-8 lg:col-span-6">
            <SectionHeading
              as="h1"
              rotulo="Erro 404"
              lead="Esse endereço não existe no site. Confira o link ou volte para o início."
            >
              Página <em>não encontrada</em>
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
          <div className="mx-auto w-[min(78%,20rem)] lg:col-span-4 lg:col-start-9">
            <Polaroid
              foto={naoEncontrada.foto}
              sizes="320px"
              legenda={naoEncontrada.legenda}
              className="r4"
            />
          </div>
        </div>
      </main>
    </>
  );
}
