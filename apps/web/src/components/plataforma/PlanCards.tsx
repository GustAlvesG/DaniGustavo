import type { PlanView } from "@casamento/shared";
import { ButtonLink } from "@/components/ui";
import { getPublicPlans } from "@/lib/api/platform";
import { formatFee, limitLines, priceLine, trialLine } from "./format";

/** Cartões dos planos públicos (landing e preços). Server Component. */
export function PlanCards({ plans, detailed = false }: { plans: PlanView[]; detailed?: boolean }) {
  if (plans.length === 0) {
    return (
      <div className="plataforma-card text-center" data-testid="planos-indisponiveis">
        <p>Os planos estão sendo preparados com carinho. Volte em breve para conferir os preços.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-10 md:grid-cols-2" data-testid="planos">
      {plans.map((plan, i) => {
        const trial = trialLine(plan.trialDays);
        return (
          <li
            key={plan.code}
            className={`plataforma-card flex flex-col gap-4 ${i === plans.length - 1 ? "plataforma-card--destaque" : ""}`}
          >
            <h3 className="font-display text-display-sm">{plan.name}</h3>
            {plan.description ? <p className="text-suave">{plan.description}</p> : null}
            <p className="font-sans text-sm uppercase tracking-[0.16em]">{priceLine(plan)}</p>
            {trial ? <p className="text-enfase italic">{trial}</p> : null}
            <ul className="plataforma-lista">
              {limitLines(plan.limits).map((line) => (
                <li key={line}>{line}</li>
              ))}
              {detailed ? (
                <li>
                  Taxa de {formatFee(plan.feeBps)} sobre os presentes em dinheiro, já descontada no
                  repasse
                </li>
              ) : null}
            </ul>
            <div className="mt-auto pt-2">
              <ButtonLink href={`/cadastro?plano=${encodeURIComponent(plan.code)}`} block>
                Começar com o {plan.name}
              </ButtonLink>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Planos lidos da API, para usar dentro de <Suspense> (a leitura não segura o resto da página). */
export async function PublicPlanCards({ detailed = false }: { detailed?: boolean }) {
  const plans = await getPublicPlans();
  return <PlanCards plans={plans} detailed={detailed} />;
}
