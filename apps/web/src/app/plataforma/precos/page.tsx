import type { Metadata } from "next";
import { Suspense } from "react";
import { PLATFORM_NAME } from "@/components/plataforma/brand";
import { PublicPlanCards } from "@/components/plataforma/PlanCards";

export const metadata: Metadata = { title: "Preços" };

/* Fase 6, frente B: página de preços (lê GET /api/plans). TODO(conteudo): perguntas frequentes. */
export default function Precos() {
  return (
    <div className="plataforma-wrap py-16">
      <h1 className="font-display text-display-md">Planos e preços do {PLATFORM_NAME}</h1>
      <p className="mt-4 max-w-measure text-lg text-suave">
        Escolha o plano do tamanho da sua celebração. Todos começam com um período de teste, e o
        site dos convidados nunca sai do ar por causa da assinatura.
      </p>
      <div className="mt-12">
        <Suspense fallback={<p className="text-suave">Carregando os planos…</p>}>
          <PublicPlanCards detailed />
        </Suspense>
      </div>
      <section className="plataforma-texto mt-16 max-w-measure" aria-labelledby="duvidas">
        <h2 id="duvidas">Dúvidas comuns</h2>
        <p>
          <strong>Como funciona a taxa dos presentes?</strong> Quando um convidado dá um presente em
          dinheiro, a taxa do plano é descontada no próprio repasse. Não há cobrança à parte.
        </p>
        <p>
          <strong>Posso trocar de plano depois?</strong> Pode, a qualquer momento, pelo painel da
          sua organização.
        </p>
        <p>
          <strong>E se eu atrasar o pagamento?</strong> Depois de um prazo de tolerância o painel
          fica só para consulta, mas o site do evento continua no ar para os convidados.
        </p>
      </section>
    </div>
  );
}
