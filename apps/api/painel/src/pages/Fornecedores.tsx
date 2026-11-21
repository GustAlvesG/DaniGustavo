import {
  CONTRACT_MAX_BYTES,
  EVENT_VENDOR_STATUS_LABELS,
  EVENT_VENDOR_STATUSES,
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  type ContractRow,
  type EventVendorRow,
  type EventVendorStatus,
  type VendorCategory,
  type VendorRow,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { useCan } from "../event.tsx";
import { formatDate, plural } from "../format.ts";
import { eh, go } from "../nav.ts";
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
} from "../ui.tsx";
import {
  draftBody,
  emptyDraft,
  RatingStars,
  VendorForm,
  type VendorDraft,
} from "./fornecedores/VendorForm.tsx";

/* Fase 4, frente B: fornecedores do evento e contratos (#/fornecedores, #/fornecedores/:id). */

const STATUS_TONE: Record<EventVendorStatus, string> = {
  prospect: "warn",
  hired: "ok",
  dismissed: "muted",
};

export function Fornecedores({ id }: { id?: number }) {
  return id ? <Detalhe id={id} /> : <Lista />;
}

function Lista() {
  const toast = useToast();
  const canWrite = useCan("vendors.write");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const { data, error, loading, reload } = useLoad(
    () => api<{ vendors: EventVendorRow[] }>("/vendors"),
    [],
  );
  const rows = (data?.vendors ?? []).filter((v) => !status || v.status === status);

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Fornecedores"
        subtitle="Quem está sendo cotado, contratado ou descartado para este evento."
        actions={
          canWrite ? (
            <button className="button" onClick={() => setAdding(true)}>
              Adicionar fornecedor
            </button>
          ) : undefined
        }
      />
      <label className="field">
        <span className="field__label">Situação</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas</option>
          {EVENT_VENDOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {EVENT_VENDOR_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && rows.length === 0 ? (
        <p className="empty">Nenhum fornecedor por aqui ainda.</p>
      ) : null}
      {rows.length ? (
        <ul className="rows">
          {rows.map((v) => (
            <li key={v.id} className="row" data-testid="fornecedor-evento">
              <div className="row__main">
                <a className="row__title" href={eh(`/fornecedores/${v.id}`)}>
                  {v.vendor.name}
                </a>
                <span className="row__meta">
                  {VENDOR_CATEGORY_LABELS[v.category]}
                  {v.vendor.phone ? ` · ${v.vendor.phone}` : ""}
                  {v.contractCount ? ` · ${plural(v.contractCount, "contrato", "contratos")}` : ""}
                </span>
              </div>
              <div className="row__side">
                <RatingStars rating={v.vendor.rating} />
                <Badge tone={STATUS_TONE[v.status]}>{EVENT_VENDOR_STATUS_LABELS[v.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <AddVendor
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(name) => {
          toast(`${name} entrou no evento.`);
          setAdding(false);
          reload();
        }}
      />
    </div>
  );
}

function AddVendor({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const [mode, setMode] = useState<"catalog" | "new">("catalog");
  const [vendorId, setVendorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data } = useLoad(
    () => (open ? api<{ vendors: VendorRow[] }>("/vendor-catalog") : Promise.resolve(null)),
    [open],
  );
  const catalog = data?.vendors ?? [];

  async function link(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { vendor } = await send<{ vendor: EventVendorRow }>("POST", "/vendors", {
        vendorId: Number(vendorId),
      });
      setVendorId("");
      onAdded(vendor.vendor.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function create(draft: VendorDraft) {
    const { vendor } = await send<{ vendor: EventVendorRow }>("POST", "/vendors", {
      vendor: draftBody(draft),
    });
    onAdded(vendor.vendor.name);
  }

  return (
    <Modal title="Adicionar fornecedor" open={open} onClose={onClose} wide>
      <div className="segmented" role="group" aria-label="Como adicionar">
        <button
          type="button"
          className={`button button--small${mode === "catalog" ? "" : " button--ghost"}`}
          onClick={() => setMode("catalog")}
        >
          Do catálogo
        </button>
        <button
          type="button"
          className={`button button--small${mode === "new" ? "" : " button--ghost"}`}
          onClick={() => setMode("new")}
        >
          Cadastrar novo
        </button>
      </div>
      {mode === "catalog" ? (
        <form className="stack" onSubmit={link}>
          <Field label="Fornecedor" hint="Só os não arquivados do catálogo da organização.">
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
              <option value="">Escolha…</option>
              {catalog.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {VENDOR_CATEGORY_LABELS[v.category]}
                </option>
              ))}
            </select>
          </Field>
          <FormError message={error} />
          <div className="actions actions--end">
            <button type="button" className="button button--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="button" disabled={saving || !vendorId}>
              {saving ? "Adicionando…" : "Adicionar ao evento"}
            </button>
          </div>
        </form>
      ) : (
        <VendorForm
          initial={emptyDraft()}
          submitLabel="Cadastrar e adicionar"
          onCancel={onClose}
          onSubmit={create}
        />
      )}
    </Modal>
  );
}

function Detalhe({ id }: { id: number }) {
  const toast = useToast();
  const canWrite = useCan("vendors.write");
  const { data, error, loading, reload } = useLoad(
    () => api<{ vendors: EventVendorRow[] }>("/vendors"),
    [id],
  );
  const row = data?.vendors.find((v) => v.id === id);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);

  async function patch(body: {
    status?: EventVendorStatus;
    category?: VendorCategory;
    notes?: string | null;
  }) {
    setBusy(true);
    try {
      await send("PATCH", `/vendors/${id}`, body);
      toast("Alteração salva.");
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await send("DELETE", `/vendors/${id}`);
      toast("Fornecedor removido do evento.");
      go("/fornecedores");
    } catch (err) {
      toast(errorMessage(err), "error");
      setRemoving(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <a className="back" href={eh("/fornecedores")}>
        ← Todos os fornecedores
      </a>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && !row ? <p className="empty">Fornecedor não encontrado neste evento.</p> : null}
      {row ? (
        <>
          <PageHeader
            title={row.vendor.name}
            subtitle={
              <>
                {VENDOR_CATEGORY_LABELS[row.vendor.category]} ·{" "}
                <RatingStars rating={row.vendor.rating} />
              </>
            }
            actions={
              canWrite ? (
                <button
                  className="button button--danger-ghost"
                  disabled={busy}
                  onClick={() => setRemoving(true)}
                >
                  Remover do evento
                </button>
              ) : undefined
            }
          />
          <section className="card stack" aria-labelledby="fe-contato">
            <h2 id="fe-contato">Contato</h2>
            <dl className="details">
              <dt>Pessoa</dt>
              <dd>{row.vendor.contactName ?? "—"}</dd>
              <dt>Telefone</dt>
              <dd>{row.vendor.phone ?? "—"}</dd>
              <dt>E-mail</dt>
              <dd>{row.vendor.email ?? "—"}</dd>
              <dt>Site</dt>
              <dd>{row.vendor.website ?? "—"}</dd>
            </dl>
            <p className="muted small">
              Os dados do fornecedor são mantidos no catálogo da organização.
            </p>
          </section>
          <section className="card stack" aria-labelledby="fe-situacao">
            <h2 id="fe-situacao">Neste evento</h2>
            <div className="form-grid">
              <Field label="Situação">
                <select
                  value={row.status}
                  disabled={!canWrite || busy}
                  onChange={(e) => void patch({ status: e.target.value as EventVendorStatus })}
                >
                  {EVENT_VENDOR_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {EVENT_VENDOR_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Categoria no evento">
                <select
                  value={row.category}
                  disabled={!canWrite || busy}
                  onChange={(e) => void patch({ category: e.target.value as VendorCategory })}
                >
                  {VENDOR_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {VENDOR_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <NotesForm
              key={row.notes ?? ""}
              initial={row.notes ?? ""}
              disabled={!canWrite || busy}
              onSave={(notes) => patch({ notes: notes || null })}
            />
          </section>
          <Contratos eventVendorId={id} canWrite={canWrite} onChange={reload} />
          <Confirm
            open={removing}
            title="Remover do evento"
            confirmLabel="Remover"
            danger
            busy={busy}
            onConfirm={() => void remove()}
            onCancel={() => setRemoving(false)}
          >
            <p>
              <strong>{row.vendor.name}</strong> sai deste evento e os contratos anexados são
              apagados. O cadastro no catálogo continua. Com orçamento contratado, a remoção é
              recusada.
            </p>
          </Confirm>
        </>
      ) : null}
    </div>
  );
}

function NotesForm({
  initial,
  disabled,
  onSave,
}: {
  initial: string;
  disabled: boolean;
  onSave: (notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(initial);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(notes);
      }}
    >
      <Field label="Observações do evento">
        <textarea
          rows={3}
          maxLength={5000}
          value={notes}
          disabled={disabled}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      {!disabled ? (
        <div className="actions actions--end">
          <button className="button" disabled={notes === initial}>
            Salvar observações
          </button>
        </div>
      ) : null}
    </form>
  );
}

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;

function Contratos({
  eventVendorId,
  canWrite,
  onChange,
}: {
  eventVendorId: number;
  canWrite: boolean;
  onChange: () => void;
}) {
  const toast = useToast();
  const base = `/vendors/${eventVendorId}/contracts`;
  const { data, error, loading, reload } = useLoad(
    () => api<{ contracts: ContractRow[] }>(base),
    [eventVendorId],
  );
  const [title, setTitle] = useState("");
  const [signedOn, setSignedOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [deleting, setDeleting] = useState<ContractRow | null>(null);

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
      if (signedOn) form.set("signedOn", signedOn);
      await api(base, { method: "POST", body: form });
      toast("Contrato anexado.");
      setTitle("");
      setSignedOn("");
      setFile(null);
      setFileKey((k) => k + 1);
      reload();
      onChange();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await send("DELETE", `${base}/${deleting.id}`);
      toast("Contrato apagado.");
      setDeleting(null);
      reload();
      onChange();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <section className="stack" aria-labelledby="fe-contratos">
      <h2 id="fe-contratos">Contratos</h2>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.contracts.length === 0 ? (
        <p className="empty">Nenhum contrato anexado.</p>
      ) : null}
      {data?.contracts.length ? (
        <ul className="rows">
          {data.contracts.map((c) => (
            <li key={c.id} className="row" data-testid="contrato">
              <div className="row__main">
                <a className="row__title" href={c.downloadUrl} download={c.originalName}>
                  {c.title}
                </a>
                <span className="row__meta">
                  {c.originalName} · {sizeLabel(c.bytes)}
                  {c.signedOn ? ` · assinado em ${formatDate(c.signedOn)}` : ""}
                </span>
              </div>
              {canWrite ? (
                <div className="row__side">
                  <button
                    className="button button--ghost button--small"
                    onClick={() => setDeleting(c)}
                  >
                    Apagar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canWrite ? (
        <form className="card stack" onSubmit={upload} noValidate aria-labelledby="fe-anexar">
          <h3 id="fe-anexar">Anexar contrato</h3>
          <div className="form-grid">
            <Field label="Nome do contrato">
              <input value={title} maxLength={191} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Data da assinatura (opcional)">
              <input type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
            </Field>
            <Field
              label="Arquivo"
              hint={`PDF, JPG, PNG ou WebP, até ${CONTRACT_MAX_BYTES / 1048576} MB.`}
              className="span-2"
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
              {saving ? "Enviando…" : "Anexar"}
            </button>
          </div>
        </form>
      ) : null}
      <Confirm
        open={deleting !== null}
        title="Apagar contrato"
        confirmLabel="Apagar"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      >
        <p>
          O arquivo <strong>{deleting?.title}</strong> é apagado para sempre.
        </p>
      </Confirm>
    </section>
  );
}
