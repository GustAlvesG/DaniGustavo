import {
  PORTAL_SOURCE_LABEL,
  VENDOR_PORTAL_DEFAULT_DAYS,
  VENDOR_PORTAL_MAX_DAYS,
  type PortalSource,
  type VendorPortalLinkCreated,
  type VendorPortalLinksResponse,
  type VendorPortalLinkView,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../../api.ts";
import { useCan } from "../../event.tsx";
import { formatDateTime } from "../../format.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  Modal,
  useLoad,
  useToast,
} from "../../ui.tsx";

/*
 * Fase 7, frente C: links do portal do fornecedor no detalhe do fornecedor (#/fornecedores/:id).
 * O link vai por e-mail; o endereço aparece uma vez para copiar (WhatsApp, por exemplo).
 */

/** Selo do que o fornecedor mandou pelo portal (orçamentos e documentos). */
export function SourceBadge({ source }: { source: PortalSource }) {
  if (source !== "portal") return null;
  return <Badge tone="info">{PORTAL_SOURCE_LABEL}</Badge>;
}

const STATUS: Record<VendorPortalLinkView["status"], { label: string; tone: string }> = {
  active: { label: "Ativo", tone: "ok" },
  expired: { label: "Expirado", tone: "muted" },
  revoked: { label: "Revogado", tone: "muted" },
};

export function PortalLinks({
  eventVendorId,
  catalogEmail,
}: {
  eventVendorId: number;
  catalogEmail: string | null;
}) {
  const toast = useToast();
  const canManage = useCan("vendors.portal");
  const base = `/vendors/${eventVendorId}/portal-links`;
  const { data, error, loading, reload } = useLoad(
    () => api<VendorPortalLinksResponse>(base),
    [eventVendorId],
  );
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<VendorPortalLinkCreated | null>(null);
  const [revoking, setRevoking] = useState<VendorPortalLinkView | null>(null);
  const [busy, setBusy] = useState(false);

  async function revoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await send("POST", `${base}/${revoking.id}/revoke`);
      toast("Link revogado. O fornecedor não entra mais por ele.");
      setRevoking(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" aria-labelledby="fe-portal">
      <div className="card__head">
        <h2 id="fe-portal">Portal do fornecedor</h2>
        {canManage ? (
          <button className="button button--small" onClick={() => setCreating(true)}>
            Enviar link
          </button>
        ) : null}
      </div>
      <p className="muted small">
        Pelo portal, o fornecedor vê o cronograma do dia, as tarefas atribuídas a ele e os próprios
        orçamentos e documentos, e envia orçamentos e arquivos. Ele nunca vê convidados nem valores
        de outros fornecedores.
      </p>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.links.length === 0 ? <p className="empty">Nenhum link enviado ainda.</p> : null}
      {data?.links.length ? (
        <ul className="rows">
          {data.links.map((l) => (
            <li key={l.id} className="row" data-testid="portal-link">
              <div className="row__main">
                <span className="row__title">{l.email}</span>
                <span className="row__meta">
                  Enviado em {formatDateTime(l.createdAt)} · vale até {formatDateTime(l.expiresAt)}
                  {l.lastUsedAt ? ` · último acesso ${formatDateTime(l.lastUsedAt)}` : ""}
                </span>
              </div>
              <div className="row__side">
                <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                {canManage && l.status === "active" ? (
                  <button
                    className="button button--ghost button--small"
                    onClick={() => setRevoking(l)}
                  >
                    Revogar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Modal
        title="Enviar link do portal"
        open={creating}
        onClose={() => {
          setCreating(false);
          setCreated(null);
        }}
      >
        {creating && !created ? (
          <NewLinkForm
            base={base}
            catalogEmail={catalogEmail}
            onCancel={() => setCreating(false)}
            onCreated={(c) => {
              setCreated(c);
              reload();
              toast(c.emailSent ? "Link enviado por e-mail." : "Link criado.");
            }}
          />
        ) : null}
        {created ? (
          <CreatedLink
            created={created}
            onClose={() => {
              setCreating(false);
              setCreated(null);
            }}
          />
        ) : null}
      </Modal>

      <Confirm
        open={revoking !== null}
        title="Revogar link"
        confirmLabel="Revogar"
        danger
        busy={busy}
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      >
        <p>
          O link enviado para <strong>{revoking?.email}</strong> para de funcionar na hora. Os
          orçamentos e documentos que o fornecedor já mandou continuam aqui.
        </p>
      </Confirm>
    </section>
  );
}

function NewLinkForm({
  base,
  catalogEmail,
  onCancel,
  onCreated,
}: {
  base: string;
  catalogEmail: string | null;
  onCancel: () => void;
  onCreated: (c: VendorPortalLinkCreated) => void;
}) {
  const [email, setEmail] = useState(catalogEmail ?? "");
  const [days, setDays] = useState(String(VENDOR_PORTAL_DEFAULT_DAYS));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const body = { email: email.trim() || undefined, days: Number(days) };
      onCreated(await send<VendorPortalLinkCreated>("POST", base, body));
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field label="E-mail do fornecedor" hint="Padrão: o e-mail do catálogo.">
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          maxLength={191}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Validade (dias)" hint={`De 1 a ${VENDOR_PORTAL_MAX_DAYS} dias.`}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={VENDOR_PORTAL_MAX_DAYS}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </Field>
      <FormError message={formError} />
      <div className="actions actions--end">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button" disabled={saving}>
          {saving ? "Enviando…" : "Enviar link"}
        </button>
      </div>
    </form>
  );
}

function CreatedLink({
  created,
  onClose,
}: {
  created: VendorPortalLinkCreated;
  onClose: () => void;
}) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(created.url);
      toast("Link copiado.");
    } catch {
      toast("Não deu para copiar. Selecione o endereço e copie.", "error");
    }
  }
  return (
    <div className="stack">
      {created.emailSent ? (
        <p className="alert alert--info" role="status">
          Enviamos o link para <strong>{created.link.email}</strong>.
        </p>
      ) : (
        <p className="alert alert--error" role="alert">
          O link foi criado, mas o e-mail não saiu. Copie o endereço abaixo e mande ao fornecedor
          por outro meio.
        </p>
      )}
      <Field
        label="Endereço do portal"
        hint="Ele aparece só agora. Quem tiver este endereço entra no portal até a validade."
      >
        <input readOnly value={created.url} onFocus={(e) => e.target.select()} />
      </Field>
      <div className="actions actions--end">
        <button type="button" className="button button--ghost" onClick={() => void copy()}>
          Copiar link
        </button>
        <button type="button" className="button" onClick={onClose}>
          Pronto
        </button>
      </div>
    </div>
  );
}
