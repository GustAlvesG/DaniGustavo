import { TERMS_VERSION } from "@casamento/shared";
import type { Metadata } from "next";
import { PLATFORM_NAME } from "@/components/plataforma/brand";

export const metadata: Metadata = { title: "Termos de uso" };

/*
 * Fase 6, frente B: termos de uso da plataforma. O aceite no cadastro grava `TERMS_VERSION`
 * (packages/shared/src/signup.ts): mudou o texto, suba a versão.
 * TODO(conteudo): texto revisado por advogado; este é um rascunho provisório.
 */
export default function Termos() {
  return (
    <article className="plataforma-wrap plataforma-texto max-w-measure py-16">
      <h1 className="font-display text-display-md">Termos de uso</h1>
      <p className="text-suave">Versão {TERMS_VERSION}. Texto provisório.</p>

      <h2>1. O que oferecemos</h2>
      <p>
        {PLATFORM_NAME} é um serviço para criar o site de um evento, receber confirmações de
        presença, montar listas de presentes e organizar tarefas, fornecedores e orçamentos.
      </p>

      <h2>2. A sua conta</h2>
      <ul>
        <li>Quem se cadastra responde pela organização criada e por quem convida para a equipe.</li>
        <li>Guarde a sua senha com cuidado e não a compartilhe.</li>
        <li>As informações dos convidados são suas: use-as só para o evento.</li>
      </ul>

      <h2>3. Planos, cobrança e taxas</h2>
      <p>
        Os planos, limites e a taxa sobre os presentes em dinheiro estão na página de preços. Com a
        assinatura em atraso, depois do prazo de tolerância, o painel fica só para consulta; o site
        dos convidados continua no ar.
      </p>

      <h2>4. Presentes em dinheiro</h2>
      <p>
        Os pagamentos são processados por um parceiro de pagamentos. O valor vai para a conta de
        recebimento cadastrada pela organização, já descontadas as tarifas do parceiro e a taxa do
        plano.
      </p>

      <h2>5. Encerramento</h2>
      <p>
        Você pode apagar eventos arquivados e a própria conta pelo painel. Alguns registros de
        pagamento são mantidos pelo tempo exigido por lei.
      </p>
    </article>
  );
}
