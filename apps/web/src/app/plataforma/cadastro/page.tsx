import type { Metadata } from "next";
import { Suspense } from "react";
import { PLATFORM_NAME } from "@/components/plataforma/brand";
import { SignupForm, type SignupPlanOption } from "@/components/plataforma/SignupForm";
import { priceLine, trialLine } from "@/components/plataforma/format";
import { getPublicPlans } from "@/lib/api/platform";

export const metadata: Metadata = { title: "Criar conta" };

/*
 * Fase 6, frente B: cadastro self-service. O formulário manda o e-mail de confirmação; a senha
 * é escolhida no painel, pelo link do e-mail. `searchParams` (?plano=) é dado de runtime: com
 * `cacheComponents` ele fica dentro de <Suspense> e o resto da página continua estático.
 */
export default function Cadastro({ searchParams }: PageProps<"/plataforma/cadastro">) {
  return (
    <div className="plataforma-wrap grid gap-12 py-16 md:grid-cols-[1fr_minmax(0,32rem)]">
      <div>
        <h1 className="font-display text-display-md">Vamos começar?</h1>
        <p className="mt-4 max-w-measure text-lg text-suave">
          Em poucos minutos o seu espaço no {PLATFORM_NAME} fica pronto. Depois de confirmar o
          e-mail, você escolhe a senha, cria o evento e já pode montar o site.
        </p>
        <ul className="plataforma-lista mt-8">
          <li>Sem cartão de crédito para testar</li>
          <li>Site, confirmação de presença e lista de presentes</li>
          <li>Convide quem ajuda a organizar</li>
        </ul>
      </div>
      <Suspense fallback={<div className="plataforma-card">Carregando o formulário…</div>}>
        <Formulario searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Formulario({
  searchParams,
}: {
  searchParams: PageProps<"/plataforma/cadastro">["searchParams"];
}) {
  const [plans, params] = await Promise.all([getPublicPlans(), searchParams]);
  const options: SignupPlanOption[] = plans.map((p) => ({
    code: p.code,
    label: [p.name, priceLine(p), trialLine(p.trialDays)].filter(Boolean).join(" · "),
  }));
  const wanted = typeof params.plano === "string" ? params.plano : "";
  const initialPlan = options.some((o) => o.code === wanted) ? wanted : (options[0]?.code ?? "");
  return <SignupForm plans={options} initialPlan={initialPlan} />;
}
