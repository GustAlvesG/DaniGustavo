import type { ModuleId, PlanAdminView, PlanLimits } from "@casamento/shared";
import { LIMIT_LABELS, MODULE_LABELS, MODULES } from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { apiRoot, errorMessage } from "../../api.ts";
import { centsToInput, formatBRL, parseBRL } from "../../format.ts";
import {
  Badge,
  ErrorBox,
  Field,
  FormError,
  Loading,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";
import { percent } from "../plano/formato.ts";
import { ph } from "./links.ts";

/*
 * Fase 6, frente A: planos no painel da plataforma (#/plataforma/planos[/:code|/novo]). Preços em
 * centavos (vazio = a definir); limites vazios = sem limite. O código não muda depois de criado.
 */

type NumericLimit = Exclude<keyof PlanLimits, "modules">;
const NUMERIC: NumericLimit[] = ["activeEvents", "guestsPerEvent", "members", "storageMb"];

interface Draft {
  code: string;
  name: string;
  description: string;
  public: boolean;
  active: boolean;
  priceMonthly: string;
  priceYearly: string;
  trialDays: string;
  feePercent: string;
  sort: string;
  limits: Record<NumericLimit, string>;
  allModules: boolean;
  modules: ModuleId[];
}

function toDraft(p: PlanAdminView | null): Draft {
  const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  return {
    code: p?.code ?? "",
    name: p?.name ?? "",
    description: p?.description ?? "",
    public: p?.public ?? true,
    active: p?.active ?? true,
    priceMonthly: p?.priceMonthlyCents == null ? "" : centsToInput(p.priceMonthlyCents),
    priceYearly: p?.priceYearlyCents == null ? "" : centsToInput(p.priceYearlyCents),
    trialDays: String(p?.trialDays ?? 0),
    feePercent: String((p?.feeBps ?? 50) / 100).replace(".", ","),
    sort: String(p?.sort ?? 0),
    limits: {
      activeEvents: num(p?.limits.activeEvents),
      guestsPerEvent: num(p?.limits.guestsPerEvent),
      members: num(p?.limits.members),
      storageMb: num(p?.limits.storageMb),
    },
    allModules: !p || p.limits.modules === null,
    modules: p?.limits.modules ?? [...MODULES],
  };
}

/** Rascunho → corpo do POST/PATCH; string = mensagem de erro. */
function toBody(d: Draft): Record<string, unknown> | string {
  const money = (text: string, label: string) => {
    if (!text.trim()) return null;
    const cents = parseBRL(text);
    if (cents === null) throw new Error(`${label}: valor inválido.`);
    return cents;
  };
  const int = (text: string, label: string) => {
    if (!text.trim()) return null;
    const n = Number(text);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${label}: informe um número inteiro.`);
    return n;
  };
  try {
    const fee = Number(d.feePercent.replace(",", "."));
    if (!Number.isFinite(fee) || fee < 0 || fee > 50) {
      return "Taxa: informe um percentual entre 0 e 50.";
    }
    const limits = Object.fromEntries(
      NUMERIC.map((k) => [k, int(d.limits[k], LIMIT_LABELS[k])]),
    ) as Record<NumericLimit, number | null>;
    return {
      name: d.name.trim(),
      description: d.description.trim() || null,
      public: d.public,
      active: d.active,
      priceMonthlyCents: money(d.priceMonthly, "Preço mensal"),
      priceYearlyCents: money(d.priceYearly, "Preço anual"),
      trialDays: int(d.trialDays, "Dias de teste") ?? 0,
      feeBps: Math.round(fee * 100),
      sort: int(d.sort, "Ordem") ?? 0,
      limits: { ...limits, modules: d.allModules ? null : d.modules },
    };
  } catch (err) {
    return errorMessage(err);
  }
}

function PlanoForm({
  plan,
  onSaved,
}: {
  plan: PlanAdminView | null;
  onSaved: (p: PlanAdminView) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => toDraft(plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = toBody(d);
    if (typeof body === "string") return setError(body);
    setBusy(true);
    setError(null);
    try {
      const res = plan
        ? await apiRoot<{ plan: PlanAdminView }>(`/platform/plans/${plan.code}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await apiRoot<{ plan: PlanAdminView }>("/platform/plans", {
            method: "POST",
            body: JSON.stringify({ ...body, code: d.code.trim() }),
          });
      toast(plan ? "Plano salvo." : "Plano criado.");
      onSaved(res.plan);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <FormError message={error} />
      <div className="grid grid--2">
        <Field label="Código" hint="Letras minúsculas, números e hífens. Não muda depois.">
          <input
            value={d.code}
            disabled={!!plan}
            required
            onChange={(e) => set("code", e.target.value)}
          />
        </Field>
        <Field label="Nome">
          <input value={d.name} required onChange={(e) => set("name", e.target.value)} />
        </Field>
      </div>
      <Field label="Descrição">
        <textarea
          rows={2}
          value={d.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="grid grid--3">
        <Field label="Preço mensal (R$)" hint="Vazio = a definir.">
          <input
            inputMode="decimal"
            value={d.priceMonthly}
            onChange={(e) => set("priceMonthly", e.target.value)}
          />
        </Field>
        <Field label="Preço anual (R$)" hint="Vazio = a definir.">
          <input
            inputMode="decimal"
            value={d.priceYearly}
            onChange={(e) => set("priceYearly", e.target.value)}
          />
        </Field>
        <Field label="Dias de teste">
          <input
            inputMode="numeric"
            value={d.trialDays}
            onChange={(e) => set("trialDays", e.target.value)}
          />
        </Field>
        <Field label="Taxa sobre os presentes (%)">
          <input
            inputMode="decimal"
            value={d.feePercent}
            onChange={(e) => set("feePercent", e.target.value)}
          />
        </Field>
        <Field label="Ordem na página de preços">
          <input inputMode="numeric" value={d.sort} onChange={(e) => set("sort", e.target.value)} />
        </Field>
      </div>
      <fieldset className="stack">
        <legend>Limites (vazio = sem limite)</legend>
        <div className="grid grid--2">
          {NUMERIC.map((k) => (
            <Field key={k} label={LIMIT_LABELS[k]}>
              <input
                inputMode="numeric"
                value={d.limits[k]}
                onChange={(e) => set("limits", { ...d.limits, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={d.allModules}
            onChange={(e) => set("allModules", e.target.checked)}
          />
          Todos os módulos do site
        </label>
        {!d.allModules ? (
          <div className="grid grid--3">
            {MODULES.map((m) => (
              <label key={m} className="check">
                <input
                  type="checkbox"
                  checked={d.modules.includes(m)}
                  onChange={(e) =>
                    set(
                      "modules",
                      e.target.checked ? [...d.modules, m] : d.modules.filter((x) => x !== m),
                    )
                  }
                />
                {MODULE_LABELS[m]}
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
      <label className="check">
        <input
          type="checkbox"
          checked={d.public}
          onChange={(e) => set("public", e.target.checked)}
        />
        Aparece na página de preços (desmarcado = plano interno, só o admin atribui)
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={d.active}
          onChange={(e) => set("active", e.target.checked)}
        />
        Ativo (inativo some da página de preços; quem já tem continua)
      </label>
      <div className="actions">
        <button className="button" disabled={busy}>
          {busy ? "Salvando…" : plan ? "Salvar plano" : "Criar plano"}
        </button>
        <a className="button button--ghost" href={ph("/planos")}>
          Voltar
        </a>
      </div>
    </form>
  );
}

export function PlanosPlataforma({ code }: { code: string | null }) {
  const { data, setData, error, loading, reload } = useLoad(
    () => apiRoot<{ plans: PlanAdminView[] }>("/platform/plans"),
    [],
  );
  const editing =
    code && code !== "novo" ? (data?.plans.find((p) => p.code === code) ?? null) : null;

  if (code) {
    return (
      <div className="stack stack--lg">
        <PageHeader title={code === "novo" ? "Novo plano" : `Plano ${editing?.name ?? code}`} />
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorBox message={error} onRetry={reload} /> : null}
        {data && code !== "novo" && !editing ? (
          <p className="empty">Plano não encontrado.</p>
        ) : null}
        {data && (code === "novo" || editing) ? (
          <PlanoForm
            key={code}
            plan={editing}
            onSaved={(p) => {
              setData((cur) =>
                cur ? { plans: [...cur.plans.filter((x) => x.code !== p.code), p] } : cur,
              );
              window.location.hash = ph("/planos");
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Planos"
        subtitle="Catálogo da página de preços e planos internos."
        actions={
          <a className="button" href={ph("/planos/novo")}>
            Novo plano
          </a>
        }
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <ul className="rows" data-testid="plataforma-planos">
          {[...data.plans]
            .sort((a, b) => a.sort - b.sort)
            .map((p) => (
              <li key={p.code} className={`row${p.active ? "" : " row--off"}`}>
                <a className="row__main" href={ph(`/planos/${p.code}`)}>
                  <span className="row__title">{p.name}</span>
                  <span className="row__meta">
                    {p.code} ·{" "}
                    {p.priceMonthlyCents === null
                      ? "preço a definir"
                      : `${formatBRL(p.priceMonthlyCents)}/mês`}{" "}
                    · taxa {percent(p.feeBps)}
                    {p.trialDays > 0 ? ` · ${p.trialDays} dias de teste` : ""}
                  </span>
                </a>
                <div className="row__side">
                  {!p.public ? <Badge tone="info">Interno</Badge> : null}
                  {!p.active ? <Badge tone="muted">Inativo</Badge> : null}
                </div>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
