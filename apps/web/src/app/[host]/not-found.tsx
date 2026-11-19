import { Polaroid } from "@/components/album";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { findCurrentEvent } from "@/lib/api/event";
import { getContent, getSite } from "@/lib/api/site";

/**
 * 404 do site: rotas que não existem e `notFound()` nas páginas (inclusive galeria e
 * padrinhos dos eventos sem esse conteúdo). Se o próprio host não é de nenhum evento
 * ativo, não há menu nem rodapé para mostrar: sai uma página neutra.
 */
export default async function NotFound() {
  const ev = await findCurrentEvent();
  if (!ev) return <HostDesconhecido />;
  const [site, { paginas }] = await Promise.all([getSite(ev), getContent(ev)]);
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
          {naoEncontrada.foto ? (
            <div className="mx-auto w-[min(78%,20rem)] lg:col-span-4 lg:col-start-9">
              <Polaroid
                foto={naoEncontrada.foto}
                sizes="320px"
                legenda={naoEncontrada.legenda}
                className="r4"
              />
            </div>
          ) : null}
        </div>
      </main>
      <SiteFooter site={site} />
    </>
  );
}

/** Host que não é de nenhum evento ativo (domínio errado, evento arquivado ou rascunho). */
function HostDesconhecido() {
  return (
    <main id="conteudo" className="flex flex-1 items-center">
      <div className="page-wrap section-space">
        <SectionHeading
          as="h1"
          rotulo="Erro 404"
          lead="Não há nenhum site de evento neste endereço. Confira o link que você recebeu."
        >
          Site <em>não encontrado</em>
        </SectionHeading>
      </div>
    </main>
  );
}
