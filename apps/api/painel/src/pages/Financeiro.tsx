import {
  QUOTE_STATUS_LABELS,
  type BudgetView,
  type InstallmentRow,
  type QuoteSummary,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { useCan, useEvent } from "../event.tsx";
import { centsToInput, formatBRL, parseBRL } from "../format.ts";
import { eh, go } from "../nav.ts";
import {
  Badge,
  ErrorBox,
  FormError,
  Loading,
  Modal,
  PageHeader,
  useLoad,
  useToast,
} from "../ui.tsx";
import {
  formatLocalDate,
  Orcamento,
  QUOTE_TONE,
  QuoteForm,
  todayLocal,
} from "./financeiro/Orcamento.tsx";
import { useCategories, type Categories } from "./fornecedores/categorias.ts";
import { SourceBadge } from "./fornecedores/PortalLinks.tsx";

/**
 * Fase 4, frente C: orçamentos, parcelas e planejado × realizado (#/financeiro e
 * #/financeiro/orcamentos/:id).
 */
export function Financeiro({ quoteId }: { quoteId?: number }) {
  if (quoteId) return <Orcamento quoteId={quoteId} />;
  return <Resumo />;
}

function Resumo() {
  const canWrite = useCan("budget.write");
  const categories = useCategories("event");
  const budget = useLoad(() => api<BudgetView>("/budget"), []);
  const quotes = useLoad(() => api<{ quotes: QuoteSummary[] }>("/quotes"), []);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState(false);

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Financeiro"
        subtitle="Orçamentos dos fornecedores, parcelas e quanto já foi gasto em relação ao previsto."
        actions={
          canWrite && (
            <button className="button" onClick={() => setCreating(true)}>
              Novo orçamento
            </button>
          )
        }
      />

      <section className="card stack">
        <div className="card__head">
          <h2>Planejado × realizado</h2>
          {canWrite && budget.data && (
            <button
              className="button button--ghost button--small"
              onClick={() => setPlanning(true)}
            >
              Editar previsto
            </button>
          )}
        </div>
        {budget.error && <ErrorBox message={budget.error} onRetry={budget.reload} />}
        {budget.loading && !budget.data ? (
          <Loading />
        ) : budget.data ? (
          <BudgetTable view={budget.data} categories={categories} />
        ) : null}
      </section>

      {budget.data && (
        <section className="card stack">
          <h2>Próximos vencimentos</h2>
          <OpenInstallments
            rows={budget.data.openInstallments}
            canWrite={canWrite}
            onPaid={() => {
              budget.reload();
              quotes.reload();
            }}
          />
        </section>
      )}

      <section className="stack">
        <h2>Orçamentos</h2>
        {quotes.error && <ErrorBox message={quotes.error} onRetry={quotes.reload} />}
        {quotes.loading && !quotes.data ? (
          <Loading />
        ) : quotes.data?.quotes.length === 0 ? (
          <p className="empty">
            Nenhum orçamento ainda. Peça propostas aos fornecedores e registre aqui para comparar.
          </p>
        ) : (
          <ul className="rows">
            {quotes.data?.quotes.map((q) => (
              <li key={q.id} className="row">
                <a className="row__main" href={eh(`/financeiro/orcamentos/${q.id}`)}>
                  <span className="row__title">{q.title}</span>
                  <span className="row__meta">
                    {q.vendorName} · {categories.label(q.category)}
                    {q.status === "contracted" && ` · pago ${formatBRL(q.paidCents)}`}
                  </span>
                </a>
                <div className="row__side row__side--stack">
                  <strong>{formatBRL(q.totalCents)}</strong>
                  <Badge tone={QUOTE_TONE[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
                  <SourceBadge source={q.source} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal title="Novo orçamento" open={creating} onClose={() => setCreating(false)} wide>
        {creating && (
          <QuoteForm
            onCancel={() => setCreating(false)}
            onSaved={(q) => {
              setCreating(false);
              go(`/financeiro/orcamentos/${q.id}`);
            }}
          />
        )}
      </Modal>

      <Modal title="Previsto por categoria" open={planning} onClose={() => setPlanning(false)} wide>
        {planning && budget.data && (
          <PlanForm
            categories={categories}
            view={budget.data}
            onCancel={() => setPlanning(false)}
            onSaved={(v) => {
              budget.setData(v);
              setPlanning(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function BudgetTable({ view, categories }: { view: BudgetView; categories: Categories }) {
  if (view.categories.length === 0) {
    return (
      <p className="muted">
        Sem previsão nem contratos ainda. Comece por “Editar previsto” com quanto pretendem gastar
        em cada categoria.
      </p>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Categoria</th>
            <th scope="col" className="num">
              Previsto
            </th>
            <th scope="col" className="num">
              Contratado
            </th>
            <th scope="col" className="num">
              Pago
            </th>
          </tr>
        </thead>
        <tbody>
          {view.categories.map((c) => {
            const over = c.plannedCents > 0 && c.contractedCents > c.plannedCents;
            return (
              <tr key={c.category}>
                <td>
                  {categories.label(c.category)}
                  {c.notes && <span className="muted small"> · {c.notes}</span>}
                </td>
                <td className="num" data-label="Previsto">
                  {formatBRL(c.plannedCents)}
                </td>
                <td className="num" data-label="Contratado">
                  {formatBRL(c.contractedCents)}
                  {over && (
                    <>
                      {" "}
                      <Badge tone="warn">acima do previsto</Badge>
                    </>
                  )}
                </td>
                <td className="num" data-label="Pago">
                  {formatBRL(c.paidCents)}
                </td>
              </tr>
            );
          })}
          <tr>
            <th scope="row">Total</th>
            <th className="num" data-label="Previsto">
              {formatBRL(view.totals.plannedCents)}
            </th>
            <th className="num" data-label="Contratado">
              {formatBRL(view.totals.contractedCents)}
            </th>
            <th className="num" data-label="Pago">
              {formatBRL(view.totals.paidCents)}
            </th>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        Falta pagar dos contratos: {formatBRL(view.totals.contractedCents - view.totals.paidCents)}.
      </p>
    </div>
  );
}

function OpenInstallments({
  rows,
  canWrite,
  onPaid,
}: {
  rows: (InstallmentRow & { vendorName: string })[];
  canWrite: boolean;
  onPaid: () => void;
}) {
  const toast = useToast();
  const { timezone } = useEvent();
  const [busy, setBusy] = useState<number | null>(null);
  if (rows.length === 0) return <p className="muted">Nenhuma parcela em aberto.</p>;

  async function pay(id: number) {
    setBusy(id);
    try {
      await send("PATCH", `/installments/${id}`, { paidOn: todayLocal(timezone) });
      toast("Parcela marcada como paga.");
      onPaid();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="rows">
      {rows.slice(0, 12).map((i) => (
        <li key={i.id} className="row">
          <a className="row__main" href={eh(`/financeiro/orcamentos/${i.quoteId}`)}>
            <span className="row__title">
              {i.vendorName} · parcela {i.number}
            </span>
            <span className="row__meta">
              vence em {formatLocalDate(i.dueOn)}
              {i.overdue && " · vencida"}
            </span>
          </a>
          <div className="row__side row__side--stack">
            <strong>{formatBRL(i.amountCents)}</strong>
            {canWrite ? (
              <button
                className="button button--small button--ghost"
                disabled={busy === i.id}
                onClick={() => void pay(i.id)}
              >
                {busy === i.id ? "Aguarde…" : "Marcar paga hoje"}
              </button>
            ) : (
              i.overdue && <Badge tone="error">Vencida</Badge>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function PlanForm({
  categories,
  view,
  onCancel,
  onSaved,
}: {
  categories: Categories;
  view: BudgetView;
  onCancel: () => void;
  onSaved: (v: BudgetView) => void;
}) {
  const toast = useToast();
  const byCat = new Map(view.categories.map((c) => [c.category, c]));
  // As escolhas (fixas + próprias) e as que já têm previsto (mesmo de categoria arquivada).
  const keys = [
    ...categories.options.map((c) => c.key),
    ...view.categories
      .map((c) => c.category)
      .filter((k) => !categories.options.some((o) => o.key === k)),
  ];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      keys.map((c) => {
        const planned = byCat.get(c)?.plannedCents ?? 0;
        return [c, planned ? centsToInput(planned) : ""];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const lines: { category: string; plannedCents: number; notes: string | null }[] = [];
    for (const category of keys) {
      const text = values[category]?.trim() ?? "";
      if (!text) continue;
      const cents = parseBRL(text);
      if (cents === null) {
        return setError(`Valor inválido em ${categories.label(category)}.`);
      }
      lines.push({ category, plannedCents: cents, notes: byCat.get(category)?.notes ?? null });
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await send<BudgetView>("PUT", "/budget", { lines }));
      toast("Previsto salvo.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void save(e)}>
      <p className="muted small">Deixe em branco as categorias sem previsão. Valores em reais.</p>
      <div className="form-grid">
        {keys.map((c) => (
          <label key={c} className="field">
            <span className="field__label">{categories.label(c)}</span>
            <input
              inputMode="decimal"
              placeholder="0,00"
              value={values[c] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [c]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <FormError message={error} />
      <div className="actions actions--end">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button" disabled={saving}>
          {saving ? "Salvando…" : "Salvar previsto"}
        </button>
      </div>
    </form>
  );
}
