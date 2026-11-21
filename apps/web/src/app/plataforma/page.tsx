import { ButtonLink } from "@/components/ui";
import { Suspense } from "react";
import { PublicPlanCards } from "@/components/plataforma/PlanCards";

/*
 * Fase 6, frente B: landing da plataforma. TODO(conteudo): textos, fotos e depoimentos
 * definitivos (estes são provisórios, no tom do site do casamento).
 */

const RECURSOS = [
  {
    titulo: "Um site com a cara de vocês",
    texto:
      "Fotos, história, programação e tudo o que os convidados precisam saber, com temas prontos e um endereço só seu.",
  },
  {
    titulo: "Confirmação de presença sem planilha",
    texto:
      "Cada família recebe o próprio link. As respostas chegam organizadas, com restrições alimentares e listas para o buffet e a portaria.",
  },
  {
    titulo: "Lista de presentes com Pix e cartão",
    texto:
      "Presentes em dinheiro com cotas, recado para o mural e o valor direto na conta de quem recebe.",
  },
  {
    titulo: "Gestão do começo ao fim",
    texto:
      "Tarefas com prazos, fornecedores e contratos, orçamentos e cronograma do dia, para a família ou para a equipe do cerimonial.",
  },
] as const;

export default function PlataformaInicio() {
  return (
    <>
      <section className="plataforma-wrap py-16 md:py-24">
        <p className="font-sans text-xs tracking-[0.22em] text-suave uppercase">
          Casamentos, 15 anos, aniversários e muito mais
        </p>
        <h1 className="mt-4 max-w-[18ch] font-display text-display-lg text-balance">
          Do primeiro convite ao último brinde, <em className="text-enfase">tudo num lugar só</em>
        </h1>
        <p className="mt-6 max-w-measure text-lg text-suave">
          Monte o site do seu evento, receba as confirmações de presença e os presentes e cuide de
          cada detalhe com calma. Feito para quem está celebrando e para quem organiza as
          celebrações dos outros.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <ButtonLink href="/cadastro" size="lg">
            Começar grátis
          </ButtonLink>
          <ButtonLink href="/precos" size="lg" variant="secondary">
            Ver os planos
          </ButtonLink>
        </div>
      </section>

      <section className="surface-areia bg-areia py-16" aria-labelledby="recursos">
        <div className="plataforma-wrap">
          <h2 id="recursos" className="font-display text-display-sm">
            O que vem junto
          </h2>
          <ul className="mt-10 grid gap-10 md:grid-cols-2">
            {RECURSOS.map((r) => (
              <li key={r.titulo} className="plataforma-card">
                <h3 className="font-display text-2xl">{r.titulo}</h3>
                <p className="mt-3 text-suave">{r.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="plataforma-wrap py-16" aria-labelledby="planos">
        <h2 id="planos" className="font-display text-display-sm">
          Planos
        </h2>
        <p className="mt-3 max-w-measure text-suave">
          Comece com um período de teste, sem cartão. Troque de plano quando quiser.
        </p>
        <div className="mt-10">
          <Suspense fallback={<p className="text-suave">Carregando os planos…</p>}>
            <PublicPlanCards />
          </Suspense>
        </div>
      </section>
    </>
  );
}
