import type {
  PlanAdminView,
  PlatformOrgDetail,
  PlatformOrgRow,
  SubscriptionStatus,
} from "@casamento/shared";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUSES } from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { apiRoot, errorMessage } from "../../api.ts";
import { formatDate } from "../../format.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";
import { CobrancasAssinatura } from "../plano/Cobrancas.tsx";
import { percent } from "../plano/formato.ts";
import { SituacaoAssinatura } from "../plano/Situacao.tsx";
import { UsoDoPlano } from "../plano/Uso.tsx";
import { ph } from "./links.ts";

/* Fase 6, frente A: organizações no painel da plataforma (#/plataforma/organizacoes[/:id]). */

const patch = (orgId: number, body: unknown) =>
  apiRoot<PlatformOrgDetail>(`/platform/orgs/${orgId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

function OrgStatus({ status }: { status: PlatformOrgRow["status"] }) {
  return status === "suspended" ? <Badge tone="error">Suspensa</Badge> : null;
}

export function OrganizacoesPlataforma() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState({ q: "", status: "" });
  const { data, error, loading, reload } = useLoad(() => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    const qs = params.toString();
    return apiRoot<{ organizations: PlatformOrgRow[] }>(`/platform/orgs${qs ? `?${qs}` : ""}`);
  }, [query.q, query.status]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setQuery({ q: q.trim(), status });
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Organizações"
        subtitle="Plano, situação da assinatura e uso de cada uma."
      />
      <form className="card grid grid--3" onSubmit={submit} role="search">
        <Field label="Buscar por nome ou slug">
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label="Situação">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="suspended">Organização suspensa</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <div className="actions">
          <button className="button" type="submit">
            Filtrar
          </button>
        </div>
      </form>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.organizations.length === 0 ? (
        <p className="empty">Nenhuma organização encontrada.</p>
      ) : null}
      {data && data.organizations.length > 0 ? (
        <ul className="rows" data-testid="plataforma-orgs">
          {data.organizations.map((o) => (
            <li key={o.id} className="row">
              <a className="row__main" href={ph(`/organizacoes/${o.id}`)}>
                <span className="row__title">{o.name}</span>
                <span className="row__meta">
                  {o.planName ?? "Sem assinatura"} · {o.usage.activeEvents} evento(s) ativo(s) ·{" "}
                  {o.usage.members} na equipe · desde {formatDate(o.createdAt)}
                </span>
              </a>
              <div className="row__side">
                <OrgStatus status={o.status} />
                {o.subscriptionStatus ? (
                  <SituacaoAssinatura status={o.subscriptionStatus} />
                ) : (
                  <Badge tone="muted">Sem assinatura</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AjustesOrg({
  detail,
  plans,
  onChange,
}: {
  detail: PlatformOrgDetail;
  plans: PlanAdminView[];
  onChange: (d: PlatformOrgDetail) => void;
}) {
  const toast = useToast();
  const org = detail.organization;
  const sub = detail.subscription;
  const [planCode, setPlanCode] = useState(org.planCode ?? "");
  const overrideNow =
    sub && sub.effectiveFeeBps !== sub.plan.feeBps ? String(sub.effectiveFeeBps / 100) : "";
  const [fee, setFee] = useState(overrideNow.replace(".", ","));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  async function save(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      onChange(await patch(org.id, body));
      toast(message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirmSuspend(false);
    }
  }

  function savePlan(e: FormEvent) {
    e.preventDefault();
    if (!planCode) return;
    void save({ planCode }, "Plano atribuído.");
  }

  function saveFee(e: FormEvent) {
    e.preventDefault();
    const text = fee.trim().replace(",", ".");
    if (text === "") return void save({ feeBpsOverride: null }, "Taxa do plano restaurada.");
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > 50) {
      setError("Taxa: informe um percentual entre 0 e 50.");
      return;
    }
    void save({ feeBpsOverride: Math.round(value * 100) }, "Taxa negociada salva.");
  }

  return (
    <section className="stack" aria-labelledby="plat-ajustes">
      <h2 id="plat-ajustes">Ajustes</h2>
      <FormError message={error} />
      <form className="card stack" onSubmit={savePlan}>
        <Field
          label="Plano"
          hint="Planos internos (como a Cortesia) não têm cobrança nem limites. Atribuir aqui não confere o uso."
        >
          <select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
            <option value="" disabled>
              Escolha um plano
            </option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
                {p.public ? "" : " (interno)"}
                {p.active ? "" : " — inativo"}
              </option>
            ))}
          </select>
        </Field>
        <div className="actions">
          <button className="button" disabled={busy || !planCode || planCode === org.planCode}>
            Atribuir plano
          </button>
        </div>
      </form>
      {sub ? (
        <form className="card stack" onSubmit={saveFee}>
          <Field
            label="Taxa negociada sobre os presentes (%)"
            hint={`Deixe vazio para usar a do plano (${percent(sub.plan.feeBps)}).`}
          >
            <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
          <div className="actions">
            <button className="button" disabled={busy}>
              Salvar taxa
            </button>
          </div>
        </form>
      ) : null}
      <div className="actions">
        {org.status === "suspended" ? (
          <button
            className="button"
            disabled={busy}
            onClick={() => void save({ status: "active" }, "Organização reativada.")}
          >
            Reativar organização
          </button>
        ) : (
          <button
            className="button button--danger-ghost"
            disabled={busy}
            onClick={() => setConfirmSuspend(true)}
          >
            Suspender organização
          </button>
        )}
      </div>
      <Confirm
        open={confirmSuspend}
        title="Suspender esta organização?"
        confirmLabel="Suspender"
        danger
        busy={busy}
        onConfirm={() => void save({ status: "suspended" }, "Organização suspensa.")}
        onCancel={() => setConfirmSuspend(false)}
      >
        <p>
          O painel da organização e dos eventos dela fica só para consulta. O site dos convidados,
          as confirmações e os presentes continuam funcionando.
        </p>
      </Confirm>
    </section>
  );
}

export function OrganizacaoPlataforma({ orgId }: { orgId: number }) {
  const { data, setData, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        apiRoot<PlatformOrgDetail>(`/platform/orgs/${orgId}`),
        apiRoot<{ plans: PlanAdminView[] }>("/platform/plans"),
      ]),
    [orgId],
  );
  const detail = data?.[0];
  const status: SubscriptionStatus | null = detail?.subscription?.status ?? null;
  return (
    <div className="stack stack--lg">
      <PageHeader
        title={detail ? detail.organization.name : "Organização"}
        subtitle={
          detail ? (
            <>
              {detail.organization.slug} · desde {formatDate(detail.organization.createdAt)}
            </>
          ) : undefined
        }
        actions={
          <a className="button button--ghost" href={ph("/organizacoes")}>
            Voltar
          </a>
        }
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {detail && data ? (
        <>
          <section className="card stack" aria-labelledby="plat-assinatura">
            <div className="card__head">
              <h2 id="plat-assinatura">{detail.subscription?.plan.name ?? "Sem assinatura"}</h2>
              <div className="actions actions--tight">
                <OrgStatus status={detail.organization.status} />
                {status ? <SituacaoAssinatura status={status} /> : null}
              </div>
            </div>
            {detail.subscription ? (
              <p className="muted small">
                Taxa sobre os presentes: {percent(detail.subscription.effectiveFeeBps)}
                {detail.subscription.trialEndsAt
                  ? ` · teste até ${formatDate(detail.subscription.trialEndsAt)}`
                  : ""}
                {detail.subscription.currentPeriodEndsAt
                  ? ` · período até ${formatDate(detail.subscription.currentPeriodEndsAt)}`
                  : ""}
                {detail.subscription.readOnly ? " · painel só leitura" : ""}
              </p>
            ) : (
              <p className="muted small">
                Organização sem assinatura (legado): sem limites e com a taxa do .env.
              </p>
            )}
          </section>
          <section className="stack" aria-labelledby="plat-uso">
            <h2 id="plat-uso">Uso</h2>
            <UsoDoPlano
              usage={detail.organization.usage}
              limits={detail.subscription?.plan.limits ?? null}
            />
          </section>
          {detail.subscription && detail.subscription.payments.length > 0 ? (
            <section className="stack" aria-labelledby="plat-cobrancas">
              <h2 id="plat-cobrancas">Cobranças</h2>
              <CobrancasAssinatura payments={detail.subscription.payments} />
            </section>
          ) : null}
          <AjustesOrg
            key={`${detail.organization.status}-${detail.organization.planCode ?? ""}-${detail.subscription?.effectiveFeeBps ?? ""}`}
            detail={detail}
            plans={data[1].plans}
            onChange={(d) => setData((cur) => (cur ? [d, cur[1]] : cur))}
          />
        </>
      ) : null}
    </div>
  );
}
