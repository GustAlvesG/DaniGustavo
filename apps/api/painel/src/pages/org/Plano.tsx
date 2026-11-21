import type {
  BillingCycle,
  PlanView,
  PublicPlansResponse,
  SubscriptionChangeResult,
  SubscriptionView,
  UsageView,
} from "@casamento/shared";
import { BILLING_CYCLE_LABELS, BILLING_CYCLES } from "@casamento/shared";
import { useState } from "react";
import { ApiFailure, errorMessage, orgApi, orgSend } from "../../api.ts";
import { formatBRL, formatDate, plural } from "../../format.ts";
import { useOrg } from "../../org.tsx";
import { Confirm, ErrorBox, FormError, Loading, PageHeader, useLoad, useToast } from "../../ui.tsx";
import { CobrancasAssinatura } from "../plano/Cobrancas.tsx";
import { percent } from "../plano/formato.ts";
import { avisoAssinatura, SituacaoAssinatura } from "../plano/Situacao.tsx";
import { UsoDoPlano } from "../plano/Uso.tsx";

/*
 * Fase 6, frente A (docs/saas/fase-6.md): plano e assinatura da organização (#/o/:orgId/plano).
 * Todos veem o plano, o uso e as cobranças; só o dono escolhe, troca ou cancela. Inadimplente,
 * esta página continua aceitando escrita (é por onde se paga).
 */

interface Loaded {
  subscription: SubscriptionView | null;
  usage: UsageView;
  plans: PlanView[];
}

async function loadAll(): Promise<Loaded> {
  const [subscription, usage, plans] = await Promise.all([
    orgApi<SubscriptionView>("/subscription").catch((err: unknown) => {
      if (err instanceof ApiFailure && err.status === 404) return null;
      throw err;
    }),
    orgApi<UsageView>("/usage"),
    fetch("/api/plans", { headers: { accept: "application/json" } }).then(async (r) => {
      if (!r.ok) throw new Error("Não deu para carregar os planos. Tente de novo.");
      return ((await r.json()) as PublicPlansResponse).plans;
    }),
  ]);
  return { subscription, usage, plans };
}

function price(plan: PlanView, cycle: BillingCycle): string {
  const cents = cycle === "yearly" ? plan.priceYearlyCents : plan.priceMonthlyCents;
  if (cents === null) return "Preço a definir";
  if (cents === 0) return "Grátis";
  return `${formatBRL(cents)} ${cycle === "yearly" ? "por ano" : "por mês"}`;
}

function limitsText(plan: PlanView): string {
  const l = plan.limits;
  const parts = [
    l.activeEvents === null
      ? "eventos ilimitados"
      : plural(l.activeEvents, "evento ativo", "eventos ativos"),
    l.guestsPerEvent === null ? "convidados ilimitados" : `até ${l.guestsPerEvent} convidados`,
    l.members === null ? "equipe ilimitada" : `até ${l.members} pessoas na equipe`,
    l.storageMb === null ? "espaço ilimitado" : `${l.storageMb} MB de fotos e arquivos`,
  ];
  return `${parts.join(" · ")}. Taxa sobre os presentes: ${percent(plan.feeBps)}.`;
}

function EscolherPlano({
  plans,
  current,
  onDone,
}: {
  plans: PlanView[];
  current: SubscriptionView | null;
  onDone: (r: SubscriptionChangeResult) => void;
}) {
  const toast = useToast();
  const [cycle, setCycle] = useState<BillingCycle>(current?.billingCycle ?? "monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(code: string) {
    setBusy(code);
    setError(null);
    try {
      const res = await orgSend<SubscriptionChangeResult>("POST", "/subscription", {
        planCode: code,
        billingCycle: cycle,
      });
      toast("Plano atualizado.");
      onDone(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="stack" aria-labelledby="plano-escolher">
      <h2 id="plano-escolher">{current ? "Trocar de plano" : "Escolher um plano"}</h2>
      <div className="tabs" role="tablist" aria-label="Ciclo de cobrança">
        {BILLING_CYCLES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            className="tab"
            aria-selected={cycle === c}
            onClick={() => setCycle(c)}
          >
            {BILLING_CYCLE_LABELS[c]}
          </button>
        ))}
      </div>
      <FormError message={error} />
      <ul className="cards">
        {plans.map((p) => {
          const isCurrent =
            current?.plan.code === p.code &&
            current.billingCycle === cycle &&
            current.status !== "canceled";
          const cents = cycle === "yearly" ? p.priceYearlyCents : p.priceMonthlyCents;
          return (
            <li key={p.code} className="card stack" data-testid={`plano-${p.code}`}>
              <div className="card__head">
                <h3>{p.name}</h3>
                <strong>{price(p, cycle)}</strong>
              </div>
              {p.description ? <p>{p.description}</p> : null}
              <p className="muted small">{limitsText(p)}</p>
              {p.trialDays > 0 && !current ? (
                <p className="muted small">{p.trialDays} dias de teste sem cobrança.</p>
              ) : null}
              <div className="actions">
                <button
                  className="button"
                  disabled={isCurrent || cents === null || busy !== null}
                  onClick={() => void choose(p.code)}
                >
                  {isCurrent
                    ? "Plano atual"
                    : busy === p.code
                      ? "Salvando…"
                      : "Escolher este plano"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        A cobrança sai na fatura do provedor de pagamento (Pix, boleto ou cartão, à sua escolha na
        própria fatura). Não dá para trocar para um plano menor que o uso atual: ajuste o uso antes.
      </p>
    </section>
  );
}

function Cancelar({ onDone }: { onDone: (s: SubscriptionView) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try {
      const s = await orgSend<SubscriptionView>("POST", "/subscription/cancel");
      toast("Assinatura cancelada.");
      setOpen(false);
      onDone(s);
    } catch (err) {
      toast(errorMessage(err), "error");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button button--danger-ghost" onClick={() => setOpen(true)}>
        Cancelar assinatura
      </button>
      <Confirm
        open={open}
        title="Cancelar a assinatura?"
        confirmLabel="Cancelar assinatura"
        danger
        busy={busy}
        onConfirm={cancel}
        onCancel={() => setOpen(false)}
      >
        <p>
          O plano vale até o fim do período já pago. Depois disso, o painel fica só para consulta (o
          site dos convidados continua no ar). Dá para escolher um plano de novo quando quiser.
        </p>
      </Confirm>
    </>
  );
}

/** Botões de desenvolvimento (provedor simulado, fora de produção). */
function Simular({ onDone }: { onDone: (s: SubscriptionView) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function simulate(outcome: "paid" | "overdue") {
    setBusy(true);
    try {
      onDone(await orgSend<SubscriptionView>("POST", "/subscription/simulate", { outcome }));
      toast(outcome === "paid" ? "Pagamento simulado." : "Vencimento simulado.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="actions">
      <button
        className="button button--ghost button--small"
        disabled={busy}
        onClick={() => void simulate("paid")}
      >
        Simular pagamento
      </button>
      <button
        className="button button--ghost button--small"
        disabled={busy}
        onClick={() => void simulate("overdue")}
      >
        Simular vencimento
      </button>
    </div>
  );
}

export function OrgPlano() {
  const org = useOrg();
  const canManage = org.role === "org_owner" || org.role === "platform_admin";
  const { data, setData, error, loading, reload } = useLoad(loadAll, [org.id]);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const sub = data?.subscription ?? null;
  const setSub = (s: SubscriptionView) =>
    setData((cur) => (cur ? { ...cur, subscription: s } : cur));
  const notice = sub ? avisoAssinatura(sub) : null;

  return (
    <div className="stack stack--lg">
      <PageHeader title="Plano e assinatura" subtitle="Plano da organização, uso e cobranças." />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          {notice ? (
            <p className={`alert ${sub?.readOnly ? "alert--error" : "alert--info"}`} role="status">
              {notice}
            </p>
          ) : null}
          <section className="card stack" aria-labelledby="plano-atual">
            <div className="card__head">
              <h2 id="plano-atual">{sub ? sub.plan.name : "Sem plano"}</h2>
              {sub ? <SituacaoAssinatura status={sub.status} /> : null}
            </div>
            {sub ? (
              <dl className="tally">
                {sub.status === "trialing" && sub.trialEndsAt ? (
                  <div>
                    <dt>Teste até</dt>
                    <dd>{formatDate(sub.trialEndsAt)}</dd>
                  </div>
                ) : null}
                {sub.currentPeriodEndsAt ? (
                  <div>
                    <dt>{sub.status === "canceled" ? "Vale até" : "Pago até"}</dt>
                    <dd>{formatDate(sub.currentPeriodEndsAt)}</dd>
                  </div>
                ) : null}
                {sub.billingCycle ? (
                  <div>
                    <dt>Ciclo</dt>
                    <dd>{BILLING_CYCLE_LABELS[sub.billingCycle]}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Taxa sobre os presentes</dt>
                  <dd>{percent(sub.effectiveFeeBps)}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">
                Esta organização ainda não tem assinatura: sem limites e com a taxa padrão da
                plataforma. Escolha um plano abaixo.
              </p>
            )}
            {invoiceUrl ? (
              <p className="alert alert--info">
                <span>Fatura gerada.</span>
                <a
                  className="button button--small"
                  href={invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir fatura
                </a>
              </p>
            ) : null}
            {canManage && sub?.canSimulate && sub.status !== "internal" ? (
              <Simular onDone={setSub} />
            ) : null}
          </section>

          <section className="stack" aria-labelledby="plano-uso">
            <h2 id="plano-uso">Uso</h2>
            <UsoDoPlano usage={sub?.usage ?? data.usage} limits={sub?.plan.limits ?? null} />
          </section>

          {sub && sub.status !== "internal" ? (
            <section className="stack" aria-labelledby="plano-cobrancas">
              <h2 id="plano-cobrancas">Cobranças</h2>
              <CobrancasAssinatura payments={sub.payments} />
            </section>
          ) : null}

          {sub?.status === "internal" ? (
            <p className="muted">
              Plano interno da plataforma: sem cobrança e sem limites. Para mudar, fale com a
              plataforma.
            </p>
          ) : canManage ? (
            <>
              <EscolherPlano
                plans={data.plans}
                current={sub}
                onDone={(r) => {
                  setSub(r.subscription);
                  setInvoiceUrl(r.invoiceUrl);
                }}
              />
              {sub && sub.status !== "canceled" ? (
                <div className="actions">
                  <Cancelar onDone={setSub} />
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted">Só o dono da organização escolhe ou troca o plano.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
