import {
  CONTRACT_MAX_BYTES,
  PORTAL_SOURCE_LABEL,
  QUOTE_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type VendorPortalDocument,
  type VendorPortalMe,
  type VendorPortalQuote,
  type VendorPortalSchedule,
  type VendorPortalScheduleItem,
  type VendorPortalTask,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../../api.ts";
import { formatBRL, formatDate, formatDateTime, parseBRL } from "../../format.ts";
import { Badge, ErrorBox, Field, FormError, Loading, useLoad, useToast } from "../../ui.tsx";
import "./portal.css";

/*
 * Fase 7, frente C (docs/saas/fase-7.md): portal do fornecedor, sem conta, em
 * `/fornecedor/#<token>` no host da API (mesmo build do painel; o App.tsx abre esta página pelo
 * `location.pathname`). O token fica no fragmento (não vai ao servidor nem ao log) e segue em
 * `Authorization: Bearer` para /api/vendor-portal. Cronograma do dia, tarefas, orçamentos e
 * documentos do próprio fornecedor; envio de orçamento e de documentos.
 */

class PortalFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const tokenFromHash = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, "")).trim();

async function portalFetch(token: string, path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(`/api/vendor-portal${path}`, {
      ...init,
      credentials: "omit",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(init.body && !(init.body instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
      },
    });
  } catch {
    throw new PortalFailure(0, "Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new PortalFailure(
      res.status,
      body?.error?.message ?? `Algo deu errado (erro ${res.status}). Tente de novo.`,
    );
  }
  return res;
}

const portalJson = async <T,>(token: string, path: string, init?: RequestInit) =>
  (await (await portalFetch(token, path, init)).json()) as T;

const TASK_TONE: Record<VendorPortalTask["status"], string> = {
  todo: "warn",
  doing: "info",
  done: "ok",
};
const QUOTE_TONE: Record<VendorPortalQuote["status"], string> = {
  draft: "muted",
  received: "info",
  approved: "ok",
  contracted: "ok",
  declined: "muted",
};

export function Portal() {
  const [token] = useState(tokenFromHash);
  // null = link inválido, expirado ou revogado (401): tela própria, sem "tentar de novo".
  const me = useLoad(async () => {
    if (!token) return null;
    try {
      return await portalJson<VendorPortalMe>(token, "/me");
    } catch (err) {
      if (err instanceof PortalFailure && err.status === 401) return null;
      throw err;
    }
  }, [token]);

  if (me.loading && me.data === null && !me.error) {
    return (
      <main className="shell shell--center">
        <Loading label="Abrindo o portal…" />
      </main>
    );
  }
  if (!me.data) {
    return (
      <main className="shell shell--center">
        <section className="card card--narrow stack">
          <h1>Portal do fornecedor</h1>
          {me.error ? (
            <ErrorBox message={me.error} onRetry={me.reload} />
          ) : (
            <p>
              Este link não vale mais (ou está incompleto). Peça um novo à organização do evento:
              ele chega por e-mail.
            </p>
          )}
        </section>
      </main>
    );
  }

  const info = me.data;
  return (
    <div className="portal">
      <header className="portal__top">
        <p>Portal do fornecedor</p>
        <strong>{info.event.name}</strong>
        <p>
          {info.vendor.name} · {info.vendor.category}
        </p>
      </header>
      <main className="portal__main stack stack--lg">
        <p className="muted small">
          {info.event.startsAt ? `Data do evento: ${formatDateTime(info.event.startsAt)}. ` : ""}
          Este link vale até {formatDateTime(info.expiresAt)}.
        </p>
        <Cronograma token={token} />
        <Tarefas token={token} />
        <Orcamentos token={token} />
        <Documentos token={token} />
      </main>
    </div>
  );
}

function Cronograma({ token }: { token: string }) {
  const { data, error, loading, reload } = useLoad(
    () => portalJson<VendorPortalSchedule>(token, "/schedule"),
    [token],
  );
  const days = new Map<string, VendorPortalScheduleItem[]>();
  for (const it of data?.items ?? []) days.set(it.date, [...(days.get(it.date) ?? []), it]);
  return (
    <section className="stack" aria-labelledby="pt-cronograma">
      <h2 id="pt-cronograma">Cronograma do dia</h2>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <p className="empty">O cronograma ainda não foi montado.</p>
      ) : null}
      {[...days].map(([date, items]) => (
        <div key={date} className="stack">
          <h3 className="portal__day">{formatDate(date)}</h3>
          <ul className="stack" role="list">
            {items.map((it, i) => (
              <li
                key={`${date}-${i}`}
                className={`portal-item${it.mine ? " portal-item--mine" : ""}`}
              >
                <span className="portal-item__time">
                  {it.startTime}
                  {it.endTime ? `–${it.endTime}` : ""}
                </span>
                <span>
                  <strong>{it.title}</strong>
                  {it.location ? <span className="muted"> · {it.location}</span> : null}{" "}
                  {it.mine ? <Badge tone="ok">Com vocês</Badge> : null}
                </span>
                {it.details ? <p className="portal-item__details">{it.details}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Tarefas({ token }: { token: string }) {
  const { data, error, loading, reload } = useLoad(
    () => portalJson<{ tasks: VendorPortalTask[] }>(token, "/tasks"),
    [token],
  );
  return (
    <section className="stack" aria-labelledby="pt-tarefas">
      <h2 id="pt-tarefas">Tarefas combinadas</h2>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.tasks.length === 0 ? (
        <p className="empty">Nenhuma tarefa atribuída a vocês.</p>
      ) : null}
      {data?.tasks.length ? (
        <ul className="rows">
          {data.tasks.map((t) => (
            <li key={t.id} className="row">
              <div className="row__main">
                <span className="row__title">{t.title}</span>
                <span className="row__meta">
                  {t.dueOn ? `Prazo: ${formatDate(t.dueOn)}` : "Sem prazo"}
                </span>
                {t.description ? <span className="row__meta">{t.description}</span> : null}
              </div>
              <div className="row__side">
                <Badge tone={TASK_TONE[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface ItemDraft {
  description: string;
  quantity: string;
  unit: string;
}
const emptyItem = (): ItemDraft => ({ description: "", quantity: "1", unit: "" });

function Orcamentos({ token }: { token: string }) {
  const { data, error, loading, reload } = useLoad(
    () => portalJson<{ quotes: VendorPortalQuote[] }>(token, "/quotes"),
    [token],
  );
  const [sending, setSending] = useState(false);
  return (
    <section className="stack" aria-labelledby="pt-orcamentos">
      <div className="card__head">
        <h2 id="pt-orcamentos">Orçamentos</h2>
        {!sending ? (
          <button className="button button--small" onClick={() => setSending(true)}>
            Enviar orçamento
          </button>
        ) : null}
      </div>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {sending ? (
        <QuoteForm
          token={token}
          onCancel={() => setSending(false)}
          onSent={() => {
            setSending(false);
            reload();
          }}
        />
      ) : null}
      {data && data.quotes.length === 0 ? <p className="empty">Nenhum orçamento ainda.</p> : null}
      {data?.quotes.length ? (
        <ul className="rows">
          {data.quotes.map((q) => (
            <li key={q.id} className="row">
              <div className="row__main">
                <span className="row__title">{q.title}</span>
                <span className="row__meta">
                  {formatDateTime(q.createdAt)}
                  {q.source === "portal" ? ` · ${PORTAL_SOURCE_LABEL.toLowerCase()}` : ""}
                </span>
              </div>
              <div className="row__side row__side--stack">
                <strong>{formatBRL(q.totalCents)}</strong>
                <Badge tone={QUOTE_TONE[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function QuoteForm({
  token,
  onCancel,
  onSent,
}: {
  token: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [discount, setDiscount] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = items.map((it) => ({
    description: it.description.trim(),
    quantity: Number(it.quantity),
    unitCents: parseBRL(it.unit),
  }));
  const subtotal = parsed.reduce(
    (s, it) =>
      s + (Number.isInteger(it.quantity) && it.unitCents !== null ? it.quantity * it.unitCents : 0),
    0,
  );
  const discountCents = discount.trim() ? parseBRL(discount) : 0;

  const setItem = (i: number, patch: Partial<ItemDraft>) =>
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setFormError("Dê um título ao orçamento.");
    if (parsed.some((it) => !it.description)) return setFormError("Descreva todos os itens.");
    if (parsed.some((it) => !Number.isInteger(it.quantity) || it.quantity < 1)) {
      return setFormError("Quantidade mínima: 1.");
    }
    if (parsed.some((it) => it.unitCents === null)) {
      return setFormError("Informe o valor de cada item (ex.: 150,00).");
    }
    if (discountCents === null) return setFormError("Desconto inválido (ex.: 50,00).");
    setSaving(true);
    setFormError(null);
    try {
      await portalFetch(token, "/quotes", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          items: parsed,
          discountCents,
          validUntil: validUntil || null,
          notes: notes.trim() || null,
        }),
      });
      toast("Orçamento enviado. A organização vai analisar.");
      onSent();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="pt-novo">
      <h3 id="pt-novo">Novo orçamento</h3>
      <Field label="Título">
        <input value={title} maxLength={191} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="stack">
        {items.map((it, i) => (
          <div key={i} className="portal-quote-item">
            <Field label={`Item ${i + 1}`}>
              <input
                value={it.description}
                maxLength={300}
                onChange={(e) => setItem(i, { description: e.target.value })}
              />
            </Field>
            <Field label="Qtd.">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={it.quantity}
                onChange={(e) => setItem(i, { quantity: e.target.value })}
              />
            </Field>
            <Field label="Valor unitário (R$)">
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={it.unit}
                onChange={(e) => setItem(i, { unit: e.target.value })}
              />
            </Field>
            <button
              type="button"
              className="button button--ghost button--small"
              aria-label={`Tirar o item ${i + 1}`}
              disabled={items.length === 1}
              onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setItems((list) => [...list, emptyItem()])}
          >
            Adicionar item
          </button>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Desconto (R$, opcional)">
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </Field>
        <Field label="Válido até (opcional)">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>
      <Field label="Observações (opcional)">
        <textarea
          rows={3}
          maxLength={5000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <p className="portal__total">
        Total: <strong>{formatBRL(Math.max(0, subtotal - (discountCents ?? 0)))}</strong>
      </p>
      <FormError message={formError} />
      <div className="actions actions--end">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button" disabled={saving}>
          {saving ? "Enviando…" : "Enviar orçamento"}
        </button>
      </div>
    </form>
  );
}

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;

function Documentos({ token }: { token: string }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => portalJson<{ documents: VendorPortalDocument[] }>(token, "/documents"),
    [token],
  );
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > CONTRACT_MAX_BYTES) {
      setFormError(`O arquivo passa de ${CONTRACT_MAX_BYTES / 1048576} MB.`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title);
      await portalFetch(token, "/documents", { method: "POST", body: form });
      toast("Documento enviado.");
      setTitle("");
      setFile(null);
      setFileKey((k) => k + 1);
      reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function download(d: VendorPortalDocument) {
    try {
      const res = await portalFetch(token, `/documents/${d.id}/file`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = d.originalName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <section className="stack" aria-labelledby="pt-documentos">
      <h2 id="pt-documentos">Documentos</h2>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.documents.length === 0 ? (
        <p className="empty">Nenhum documento ainda.</p>
      ) : null}
      {data?.documents.length ? (
        <ul className="rows">
          {data.documents.map((d) => (
            <li key={d.id} className="row">
              <div className="row__main">
                <span className="row__title">{d.title}</span>
                <span className="row__meta">
                  {d.originalName} · {sizeLabel(d.bytes)} ·{" "}
                  {d.source === "portal" ? "enviado por vocês" : "enviado pela organização"}
                </span>
              </div>
              <div className="row__side">
                <button
                  className="button button--ghost button--small"
                  onClick={() => void download(d)}
                >
                  Baixar
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="card stack" onSubmit={upload} noValidate aria-labelledby="pt-enviar">
        <h3 id="pt-enviar">Enviar documento</h3>
        <div className="form-grid">
          <Field label="Nome do documento">
            <input value={title} maxLength={191} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field
            label="Arquivo"
            hint={`PDF, JPG, PNG ou WebP, até ${CONTRACT_MAX_BYTES / 1048576} MB.`}
          >
            <input
              key={fileKey}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        <FormError message={formError} />
        <div className="actions actions--end">
          <button className="button" disabled={saving || !file || !title.trim()}>
            {saving ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </form>
    </section>
  );
}
