import {
  planInstallments,
  QUOTE_STATUS_LABELS,
  QUOTE_TRANSITIONS,
  quoteSubtotal,
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  type EventVendorRow,
  type InstallmentInput,
  type InstallmentRow,
  type QuoteInput,
  type QuoteStatus,
  type QuoteView,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../../api.ts";
import { useCan, useEvent } from "../../event.tsx";
import { centsToInput, formatBRL, parseBRL } from "../../format.ts";
import { eh, go } from "../../nav.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  Modal,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";

/** Tom do selo de cada status do orçamento (classes de `Badge`). */
export const QUOTE_TONE: Record<QuoteStatus, string> = {
  draft: "muted",
  received: "info",
  approved: "warn",
  contracted: "ok",
  declined: "muted",
};

/** Rótulo do botão que leva a cada status. */
const MOVE_LABEL: Record<QuoteStatus, string> = {
  draft: "Voltar a rascunho",
  received: "Marcar como recebido",
  approved: "Aprovar",
  contracted: "Contratar",
  declined: "Recusar",
};

/** "2027-04-10" → "10/04/2027" (data de calendário: sem conversão de fuso). */
export const formatLocalDate = (date: string | null) =>
  date ? date.split("-").reverse().join("/") : "—";

/** Hoje "AAAA-MM-DD" no fuso do evento (en-CA formata assim). */
export const todayLocal = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/* ------------------------------------------------------------------------ */
/* Detalhe                                                                   */
/* ------------------------------------------------------------------------ */

export function Orcamento({ quoteId }: { quoteId: number }) {
  const toast = useToast();
  const { timezone } = useEvent();
  const canWrite = useCan("budget.write");
  const { data, setData, error, loading, reload } = useLoad(
    () => api<{ quote: QuoteView }>(`/quotes/${quoteId}`),
    [quoteId],
  );
  const [editing, setEditing] = useState(false);
  const [contracting, setContracting] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data)
    return <ErrorBox message={error ?? "Orçamento não encontrado."} onRetry={reload} />;
  const q = data.quote;
  const locked = q.status === "contracted";
  const moves = QUOTE_TRANSITIONS[q.status].filter((s) => s !== "contracted");

  async function act(fn: () => Promise<{ quote: QuoteView }>, done: string) {
    setBusy(true);
    try {
      setData(await fn());
      toast(done);
      return true;
    } catch (err) {
      toast(errorMessage(err), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const move = (status: QuoteStatus) =>
    act(
      () => send("POST", `/quotes/${q.id}/status`, { status }),
      `Orçamento agora está como “${QUOTE_STATUS_LABELS[status]}”.`,
    );

  async function remove() {
    setBusy(true);
    try {
      await send("DELETE", `/quotes/${q.id}`);
      toast("Orçamento excluído.");
      go("/financeiro");
    } catch (err) {
      toast(errorMessage(err), "error");
      setBusy(false);
    }
  }

  async function pay(i: InstallmentRow, paid: boolean) {
    setBusy(true);
    try {
      await send("PATCH", `/installments/${i.id}`, { paidOn: paid ? todayLocal(timezone) : null });
      toast(paid ? "Parcela marcada como paga." : "Pagamento desfeito.");
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const openCents = q.installments.filter((i) => !i.paidAt).reduce((s, i) => s + i.amountCents, 0);

  return (
    <div className="stack stack--lg">
      <div className="stack">
        <a className="back" href={eh("/financeiro")}>
          ← Financeiro
        </a>
        <PageHeader
          title={q.title}
          subtitle={
            <>
              {q.vendorName} · {VENDOR_CATEGORY_LABELS[q.category] ?? q.category} ·{" "}
              <Badge tone={QUOTE_TONE[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
            </>
          }
          actions={
            canWrite &&
            !locked && (
              <>
                <button className="button button--ghost" onClick={() => setEditing(true)}>
                  Editar
                </button>
                <button className="button button--danger-ghost" onClick={() => setDeleting(true)}>
                  Excluir
                </button>
              </>
            )
          }
        />
      </div>

      <dl className="tally">
        <div>
          <dt>Total</dt>
          <dd>{formatBRL(q.totalCents)}</dd>
        </div>
        {locked && (
          <>
            <div>
              <dt>Pago</dt>
              <dd>{formatBRL(q.paidCents)}</dd>
            </div>
            <div>
              <dt>A pagar</dt>
              <dd>{formatBRL(q.totalCents - q.paidCents)}</dd>
            </div>
          </>
        )}
        {q.validUntil && !locked && (
          <div>
            <dt>Válido até</dt>
            <dd>{formatLocalDate(q.validUntil)}</dd>
          </div>
        )}
      </dl>

      {canWrite && !locked && (
        <section className="card stack">
          <h2>Andamento</h2>
          <p className="muted small">
            Rascunho → recebido → aprovado → contratado. Ao contratar, informe as parcelas: o
            orçamento fica fechado e o fornecedor passa a “Contratado”.
          </p>
          <div className="actions">
            {QUOTE_TRANSITIONS[q.status].includes("contracted") && (
              <button className="button" disabled={busy} onClick={() => setContracting(true)}>
                Contratar…
              </button>
            )}
            {moves.map((s) => (
              <button
                key={s}
                className={`button ${s === "declined" ? "button--danger-ghost" : "button--ghost"}`}
                disabled={busy}
                onClick={() => void move(s)}
              >
                {MOVE_LABEL[s]}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>Itens</h2>
        {q.items.length === 0 ? (
          <p className="muted">Nenhum item. Edite o orçamento para incluir os itens da proposta.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" style={RIGHT}>
                    Total
                  </th>
                  <th scope="col">Quantidade × unitário</th>
                </tr>
              </thead>
              <tbody>
                {q.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.description}</td>
                    <td style={RIGHT}>{formatBRL(it.totalCents)}</td>
                    <td>
                      {it.quantity} × {formatBRL(it.unitCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {q.discountCents > 0 && (
          <p className="muted small">Desconto: {formatBRL(q.discountCents)}</p>
        )}
        {q.notes && <p className="muted small">{q.notes}</p>}
      </section>

      {locked && (
        <section className="card stack">
          <div className="card__head">
            <h2>Parcelas</h2>
            {canWrite && openCents > 0 && (
              <button
                className="button button--ghost button--small"
                onClick={() => setReplanning(true)}
              >
                Refazer parcelas em aberto
              </button>
            )}
          </div>
          <ul className="rows">
            {q.installments.map((i) => (
              <li key={i.id} className="row">
                <div className="row__main">
                  <span className="row__title">
                    Parcela {i.number} · {formatBRL(i.amountCents)}
                  </span>
                  <span className="row__meta">
                    vence em {formatLocalDate(i.dueOn)}
                    {i.paidAt && ` · paga em ${formatLocalDate(i.paidAt)}`}
                    {i.method && ` · ${i.method}`}
                    {i.notes && ` · ${i.notes}`}
                  </span>
                </div>
                <div className="row__side row__side--stack">
                  {i.paidAt ? (
                    <Badge tone="ok">Paga</Badge>
                  ) : i.overdue ? (
                    <Badge tone="error">Vencida</Badge>
                  ) : (
                    <Badge tone="warn">Em aberto</Badge>
                  )}
                  {canWrite && (
                    <button
                      className="button button--small button--ghost"
                      disabled={busy}
                      onClick={() => void pay(i, !i.paidAt)}
                    >
                      {i.paidAt ? "Desfazer" : "Marcar paga hoje"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal title="Editar orçamento" open={editing} onClose={() => setEditing(false)} wide>
        {editing && (
          <QuoteForm
            quote={q}
            onCancel={() => setEditing(false)}
            onSaved={(saved) => {
              setData({ quote: saved });
              setEditing(false);
            }}
          />
        )}
      </Modal>

      <Modal title="Contratar" open={contracting} onClose={() => setContracting(false)} wide>
        {contracting && (
          <InstallmentEditor
            totalCents={q.totalCents}
            intro={`Divida ${formatBRL(q.totalCents)} nas parcelas combinadas com o fornecedor. Depois de contratado, o orçamento não muda mais.`}
            submitLabel="Contratar"
            onCancel={() => setContracting(false)}
            onSubmit={async (installments) => {
              const ok = await act(
                () =>
                  send("POST", `/quotes/${q.id}/status`, { status: "contracted", installments }),
                "Orçamento contratado.",
              );
              if (ok) setContracting(false);
            }}
          />
        )}
      </Modal>

      <Modal
        title="Refazer parcelas em aberto"
        open={replanning}
        onClose={() => setReplanning(false)}
        wide
      >
        {replanning && (
          <InstallmentEditor
            totalCents={openCents}
            intro={`As parcelas já pagas ficam como estão. Redivida o que falta: ${formatBRL(openCents)}.`}
            initial={q.installments.filter((i) => !i.paidAt)}
            submitLabel="Salvar parcelas"
            onCancel={() => setReplanning(false)}
            onSubmit={async (installments) => {
              const ok = await act(
                () => send("PUT", `/quotes/${q.id}/installments`, { installments }),
                "Parcelas atualizadas.",
              );
              if (ok) setReplanning(false);
            }}
          />
        )}
      </Modal>

      <Confirm
        open={deleting}
        title="Excluir orçamento?"
        confirmLabel="Excluir"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(false)}
      >
        <p>“{q.title}” sai do financeiro com todos os itens. Não dá para desfazer.</p>
      </Confirm>
    </div>
  );
}

const RIGHT = { textAlign: "right" } as const;

/* ------------------------------------------------------------------------ */
/* Plano de parcelas                                                         */
/* ------------------------------------------------------------------------ */

interface DraftInstallment {
  dueOn: string;
  amount: string;
  method: string;
}

function InstallmentEditor({
  totalCents,
  intro,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  totalCents: number;
  intro: string;
  initial?: InstallmentRow[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (installments: InstallmentInput[]) => Promise<void>;
}) {
  const { timezone } = useEvent();
  const [count, setCount] = useState(String(initial?.length || 1));
  const [first, setFirst] = useState(initial?.[0]?.dueOn ?? todayLocal(timezone));
  const [rows, setRows] = useState<DraftInstallment[]>(() =>
    initial?.length
      ? initial.map((i) => ({
          dueOn: i.dueOn,
          amount: centsToInput(i.amountCents),
          method: i.method ?? "",
        }))
      : [{ dueOn: todayLocal(timezone), amount: centsToInput(totalCents), method: "" }],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function generate() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 60) return setError("Use de 1 a 60 parcelas.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return setError("Informe o primeiro vencimento.");
    setError(null);
    setRows(
      planInstallments(totalCents, n, first).map((p) => ({
        dueOn: p.dueOn,
        amount: centsToInput(p.amountCents),
        method: "",
      })),
    );
  }

  const cents = rows.map((r) => parseBRL(r.amount));
  const sum = cents.reduce<number>((s, c) => s + (c ?? 0), 0);
  const update = (i: number, patch: Partial<DraftInstallment>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (cents.some((c) => c === null || c <= 0))
      return setError("Confira os valores das parcelas.");
    if (rows.some((r) => !r.dueOn)) return setError("Toda parcela precisa de vencimento.");
    if (sum !== totalCents) {
      return setError(
        `As parcelas somam ${formatBRL(sum)}; precisam somar ${formatBRL(totalCents)}.`,
      );
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(
        rows.map((r, i) => ({
          dueOn: r.dueOn,
          amountCents: cents[i]!,
          method: r.method.trim() || null,
          notes: null,
        })),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <p className="muted">{intro}</p>
      <div className="sub-card form-grid">
        <Field label="Parcelas mensais">
          <input
            type="number"
            min={1}
            max={60}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </Field>
        <Field label="Primeiro vencimento">
          <input type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <div className="actions span-2">
          <button type="button" className="button button--ghost button--small" onClick={generate}>
            Dividir em partes iguais
          </button>
        </div>
      </div>

      {rows.map((r, i) => (
        <div key={i} className="form-grid">
          <Field label={`Parcela ${i + 1}: vencimento`}>
            <input
              type="date"
              value={r.dueOn}
              onChange={(e) => update(i, { dueOn: e.target.value })}
            />
          </Field>
          <Field label="Valor (R$)">
            <input
              inputMode="decimal"
              value={r.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
            />
          </Field>
          <Field label="Forma (opcional)" className="span-2">
            <input
              placeholder="Pix, boleto, transferência…"
              maxLength={32}
              value={r.method}
              onChange={(e) => update(i, { method: e.target.value })}
            />
          </Field>
          {rows.length > 1 && (
            <div className="actions actions--tight span-2">
              <button
                type="button"
                className="button button--small button--danger-ghost"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                Tirar parcela
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="actions">
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() =>
            setRows((rs) => [
              ...rs,
              { dueOn: rs[rs.length - 1]?.dueOn ?? first, amount: "", method: "" },
            ])
          }
        >
          Mais uma parcela
        </button>
      </div>
      <p className={sum === totalCents ? "muted small" : "small"}>
        Soma: {formatBRL(sum)} de {formatBRL(totalCents)}
      </p>
      <FormError message={error} />
      <div className="actions actions--end">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button" disabled={saving}>
          {saving ? "Aguarde…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------ */
/* Formulário do orçamento                                                   */
/* ------------------------------------------------------------------------ */

interface DraftItem {
  description: string;
  quantity: string;
  unit: string;
}

const emptyItem = (): DraftItem => ({ description: "", quantity: "1", unit: "" });

export function QuoteForm({
  quote,
  onCancel,
  onSaved,
}: {
  quote?: QuoteView;
  onCancel: () => void;
  onSaved: (q: QuoteView) => void;
}) {
  const toast = useToast();
  // Fornecedores do evento (frente B); sem acesso a eles, o orçamento existente mantém o seu.
  const vendors = useLoad(() => api<{ vendors: EventVendorRow[] }>("/vendors"), []);
  const [eventVendorId, setEventVendorId] = useState(quote ? String(quote.eventVendorId) : "");
  const [title, setTitle] = useState(quote?.title ?? "");
  const [category, setCategory] = useState<string>(quote?.category ?? "");
  const [validUntil, setValidUntil] = useState(quote?.validUntil ?? "");
  const [discount, setDiscount] = useState(
    quote?.discountCents ? centsToInput(quote.discountCents) : "",
  );
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [items, setItems] = useState<DraftItem[]>(() =>
    quote?.items.length
      ? quote.items.map((it) => ({
          description: it.description,
          quantity: String(it.quantity),
          unit: centsToInput(it.unitCents),
        }))
      : [emptyItem()],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = (vendors.data?.vendors ?? []).filter((v) => v.status !== "dismissed");
  if (quote && !options.some((v) => v.id === quote.eventVendorId)) {
    options.unshift({
      id: quote.eventVendorId,
      vendor: { name: quote.vendorName },
      category: quote.category,
    } as EventVendorRow);
  }

  const parsedItems = items
    .filter((it) => it.description.trim() || it.unit.trim())
    .map((it) => ({
      description: it.description.trim(),
      quantity: Number(it.quantity),
      unitCents: parseBRL(it.unit),
    }));
  const subtotal = quoteSubtotal(
    parsedItems.map((it) => ({
      quantity: Number.isInteger(it.quantity) ? it.quantity : 0,
      unitCents: it.unitCents ?? 0,
    })),
  );
  const discountCents = discount.trim() ? parseBRL(discount) : 0;
  const update = (i: number, patch: Partial<DraftItem>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!eventVendorId) return setError("Escolha o fornecedor.");
    if (discountCents === null) return setError("Desconto inválido.");
    for (const it of parsedItems) {
      if (!it.description) return setError("Todo item precisa de descrição.");
      if (!Number.isInteger(it.quantity) || it.quantity < 1) {
        return setError(`Quantidade inválida em “${it.description}”.`);
      }
      if (it.unitCents === null) return setError(`Valor inválido em “${it.description}”.`);
    }
    const body: QuoteInput = {
      eventVendorId: Number(eventVendorId),
      title,
      category: (category || undefined) as QuoteInput["category"],
      discountCents,
      validUntil: validUntil || null,
      notes: notes.trim() || null,
      items: parsedItems.map((it) => ({ ...it, unitCents: it.unitCents! })),
    };
    setSaving(true);
    setError(null);
    try {
      const { quote: saved } = quote
        ? await send<{ quote: QuoteView }>("PUT", `/quotes/${quote.id}`, body)
        : await send<{ quote: QuoteView }>("POST", "/quotes", body);
      toast(quote ? "Orçamento salvo." : "Orçamento criado.");
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void save(e)}>
      {vendors.error && !quote && (
        <p className="alert alert--info">
          Não deu para carregar os fornecedores do evento ({vendors.error}). Cadastre-os em
          Fornecedores e volte aqui.
        </p>
      )}
      <div className="form-grid">
        <Field label="Fornecedor">
          <select
            required
            value={eventVendorId}
            onChange={(e) => setEventVendorId(e.target.value)}
            disabled={vendors.loading && !quote}
          >
            <option value="">{vendors.loading ? "Carregando…" : "Escolha…"}</option>
            {options.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nome do orçamento">
          <input
            required
            maxLength={191}
            placeholder="Proposta com jantar completo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Categoria" hint="Em branco: a do fornecedor no evento.">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Do fornecedor</option>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {VENDOR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Válido até (opcional)">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>

      <h3>Itens</h3>
      {items.map((it, i) => (
        <div key={i} className="sub-card form-grid">
          <Field label="Descrição" className="span-2">
            <input
              maxLength={300}
              value={it.description}
              onChange={(e) => update(i, { description: e.target.value })}
            />
          </Field>
          <Field label="Quantidade">
            <input
              type="number"
              min={1}
              value={it.quantity}
              onChange={(e) => update(i, { quantity: e.target.value })}
            />
          </Field>
          <Field label="Valor unitário (R$)">
            <input
              inputMode="decimal"
              placeholder="0,00"
              value={it.unit}
              onChange={(e) => update(i, { unit: e.target.value })}
            />
          </Field>
          {items.length > 1 && (
            <div className="actions actions--tight span-2">
              <button
                type="button"
                className="button button--small button--danger-ghost"
                onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
              >
                Tirar item
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="actions">
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => setItems((xs) => [...xs, emptyItem()])}
        >
          Mais um item
        </button>
      </div>

      <div className="form-grid">
        <Field label="Desconto (R$)">
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </Field>
        <div className="field">
          <span className="field__label">Total</span>
          <strong>{formatBRL(Math.max(0, subtotal - (discountCents ?? 0)))}</strong>
          <span className="field__hint">
            Soma dos itens {formatBRL(subtotal)}; o servidor confere.
          </span>
        </div>
        <Field label="Observações" className="span-2">
          <textarea
            rows={3}
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>

      <FormError message={error} />
      <div className="actions actions--end">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button" disabled={saving}>
          {saving ? "Salvando…" : quote ? "Salvar" : "Criar orçamento"}
        </button>
      </div>
    </form>
  );
}
