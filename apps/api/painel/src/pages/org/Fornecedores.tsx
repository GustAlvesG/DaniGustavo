import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from "@casamento/shared";
import type { VendorRow } from "@casamento/shared";
import { useState } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { statusLabel } from "../../event.tsx";
import { goOrg, oh } from "../../nav.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";
import {
  draftBody,
  draftOf,
  emptyDraft,
  RatingStars,
  VendorForm,
} from "../fornecedores/VendorForm.tsx";

/* Fase 4, frente B: catálogo de fornecedores da organização (#/o/:orgId/fornecedores[/:id]). */

interface VendorDetail {
  vendor: VendorRow;
  events: { id: number; name: string; status: string }[];
}

export function OrgFornecedores({ id }: { id?: number }) {
  return id ? <Detalhe id={id} /> : <Catalogo />;
}

function Catalogo() {
  const toast = useToast();
  const [category, setCategory] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useLoad(() => {
    const q = new URLSearchParams();
    if (category) q.set("category", category);
    if (showArchived) q.set("archived", "1");
    return orgApi<{ vendors: VendorRow[] }>(`/vendors${q.size ? `?${q}` : ""}`);
  }, [category, showArchived]);

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Fornecedores"
        subtitle="Catálogo da organização: cadastre uma vez e use em quantos eventos quiser."
        actions={
          <button className="button" onClick={() => setCreating(true)}>
            Novo fornecedor
          </button>
        }
      />
      <div className="inline-fields">
        <label className="field">
          <span className="field__label">Categoria</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {VENDOR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>Mostrar arquivados</span>
        </label>
      </div>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.vendors.length === 0 ? (
        <p className="empty">Nenhum fornecedor por aqui ainda.</p>
      ) : null}
      {data && data.vendors.length ? (
        <ul className="rows">
          {data.vendors.map((v) => (
            <li
              key={v.id}
              className={`row${v.archived ? " row--off" : ""}`}
              data-testid="fornecedor"
            >
              <div className="row__main">
                <a className="row__title" href={oh(`/fornecedores/${v.id}`)}>
                  {v.name}
                </a>
                <span className="row__meta">
                  {VENDOR_CATEGORY_LABELS[v.category]}
                  {v.phone ? ` · ${v.phone}` : ""}
                  {v.eventCount ? ` · em ${v.eventCount} evento${v.eventCount > 1 ? "s" : ""}` : ""}
                </span>
              </div>
              <div className="row__side">
                {v.archived ? <Badge tone="muted">Arquivado</Badge> : null}
                <RatingStars rating={v.rating} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <Modal title="Novo fornecedor" open={creating} onClose={() => setCreating(false)} wide>
        <VendorForm
          initial={emptyDraft()}
          submitLabel="Cadastrar"
          onCancel={() => setCreating(false)}
          onSubmit={async (draft) => {
            const { vendor } = await orgSend<{ vendor: VendorRow }>(
              "POST",
              "/vendors",
              draftBody(draft),
            );
            toast(`${vendor.name} entrou no catálogo.`);
            setCreating(false);
            reload();
          }}
        />
      </Modal>
    </div>
  );
}

function Detalhe({ id }: { id: number }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => orgApi<VendorDetail>(`/vendors/${id}`),
    [id],
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function archive(archived: boolean) {
    setBusy(true);
    try {
      await orgSend("PATCH", `/vendors/${id}`, { archived });
      toast(archived ? "Fornecedor arquivado." : "Fornecedor reativado.");
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
      await orgSend("DELETE", `/vendors/${id}`);
      toast("Fornecedor apagado.");
      goOrg("/fornecedores");
    } catch (err) {
      toast(errorMessage(err), "error");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <a className="back" href={oh("/fornecedores")}>
        ← Todos os fornecedores
      </a>
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <PageHeader
            title={data.vendor.name}
            subtitle={VENDOR_CATEGORY_LABELS[data.vendor.category]}
            actions={
              <>
                <button
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => void archive(!data.vendor.archived)}
                >
                  {data.vendor.archived ? "Reativar" : "Arquivar"}
                </button>
                <button
                  className="button button--danger-ghost"
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  Apagar
                </button>
              </>
            }
          />
          <section className="card stack" aria-labelledby="forn-dados">
            <h2 id="forn-dados">Dados</h2>
            <VendorForm
              key={`${data.vendor.id}-${data.vendor.name}-${data.vendor.rating}`}
              initial={draftOf(data.vendor)}
              submitLabel="Salvar"
              onSubmit={async (draft) => {
                await orgSend("PATCH", `/vendors/${id}`, draftBody(draft));
                toast("Dados salvos.");
                reload();
              }}
            />
          </section>
          <section className="stack" aria-labelledby="forn-eventos">
            <h2 id="forn-eventos">Eventos em que participa</h2>
            {data.events.length === 0 ? (
              <p className="empty">Ainda não foi ligado a nenhum evento.</p>
            ) : (
              <ul className="rows">
                {data.events.map((e) => (
                  <li key={e.id} className="row">
                    <div className="row__main">
                      <a className="row__title" href={`#/e/${e.id}/fornecedores`}>
                        {e.name}
                      </a>
                    </div>
                    <div className="row__side">
                      <Badge tone="muted">{statusLabel(e.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Confirm
            open={confirming}
            title="Apagar fornecedor"
            confirmLabel="Apagar"
            danger
            busy={busy}
            onConfirm={() => void remove()}
            onCancel={() => setConfirming(false)}
          >
            <p>
              <strong>{data.vendor.name}</strong> sai do catálogo. Se já estiver em algum evento, o
              sistema vai recusar: arquive em vez de apagar.
            </p>
          </Confirm>
        </>
      ) : null}
    </div>
  );
}
