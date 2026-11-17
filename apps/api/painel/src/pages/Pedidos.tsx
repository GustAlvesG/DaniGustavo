import type {
  AdminOrder,
  AdminOrderDetail,
  OrderStatus,
  PaymentMethod,
  ReconcileResult,
} from "@casamento/shared";
import { useState } from "react";
import { api, errorMessage, send } from "../api.ts";
import { formatBRL, formatDateTime, plural } from "../format.ts";
import { go } from "../nav.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  Loading,
  Modal,
  PageHeader,
  useLoad,
  useToast,
} from "../ui.tsx";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Aguardando",
  paid: "Pago",
  expired: "Expirado",
  failed: "Falhou",
  refunded: "Reembolsado",
};
const METHOD_LABEL: Record<PaymentMethod, string> = { pix: "Pix", card: "Cartão" };

export function Pedidos({ openId }: { openId?: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<"" | OrderStatus>("");
  const [method, setMethod] = useState<"" | PaymentMethod>("");
  const [q, setQ] = useState("");
  const [checking, setChecking] = useState(false);
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (method) params.set("method", method);
  if (q.trim()) params.set("q", q.trim());
  const query = params.toString();
  const { data, error, loading, reload } = useLoad(
    () => api<{ orders: AdminOrder[] }>(`/orders?${query}`),
    [query],
  );

  async function reconcile() {
    setChecking(true);
    try {
      const r = await send<ReconcileResult>("POST", "/orders/reconcile");
      toast(
        r.changed.length
          ? `${plural(r.checked, "pedido conferido", "pedidos conferidos")}; ${plural(r.changed.length, "corrigido", "corrigidos")}.`
          : `${plural(r.checked, "pedido conferido", "pedidos conferidos")}: tudo certo com o provedor.`,
        r.errors ? "error" : "ok",
      );
      if (r.changed.length) reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Pedidos"
        subtitle="Presentes comprados no site. Só leitura, com reembolso."
        actions={
          <button className="button button--ghost" onClick={reconcile} disabled={checking}>
            {checking ? "Conferindo…" : "Conferir com o provedor"}
          </button>
        }
      />
      <div className="filters" role="search">
        <Field label="Buscar">
          <input
            type="search"
            placeholder="Nome, e-mail ou presente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <Field label="Situação">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Todas</option>
            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Forma">
          <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="">Todas</option>
            <option value="pix">Pix</option>
            <option value="card">Cartão</option>
          </select>
        </Field>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : data && data.orders.length === 0 ? (
        <p className="empty">Nenhum pedido {query ? "com esse filtro" : "ainda"}.</p>
      ) : (
        <ul className="rows" aria-busy={loading}>
          {data?.orders.map((o) => (
            <li key={o.publicId} className="row">
              <a className="row__main" href={`#/pedidos/${o.publicId}`}>
                <span className="row__title">
                  {o.gift.title}
                  {o.quantity > 1 && ` × ${o.quantity}`}
                </span>
                <span className="row__meta">
                  {o.buyerName} · {METHOD_LABEL[o.method]} · {formatDateTime(o.createdAt)}
                </span>
              </a>
              <div className="row__side row__side--stack">
                <strong>{formatBRL(o.totalCents)}</strong>
                <Badge tone={o.status}>{ORDER_STATUS_LABEL[o.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal title="Pedido" open={!!openId} onClose={() => go("/pedidos")} wide>
        {openId && <OrderDetail publicId={openId} onChanged={reload} />}
      </Modal>
    </div>
  );
}

function OrderDetail({ publicId, onChanged }: { publicId: string; onChanged: () => void }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => api<{ order: AdminOrderDetail }>(`/orders/${publicId}`),
    [publicId],
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data)
    return <ErrorBox message={error ?? "Pedido não encontrado."} onRetry={reload} />;
  const o = data.order;

  async function refund() {
    setBusy(true);
    try {
      await send("POST", `/orders/${o.publicId}/refund`);
      toast("Reembolso feito. O valor volta para o convidado pelo provedor de pagamento.");
      setConfirming(false);
      reload();
      onChanged();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="detail-head">
        <p className="big">{formatBRL(o.totalCents)}</p>
        <Badge tone={o.status}>{ORDER_STATUS_LABEL[o.status]}</Badge>
      </div>
      <dl className="details">
        <div>
          <dt>Presente</dt>
          <dd>
            {o.gift.title}
            {o.quantity > 1 && ` (${o.quantity} cotas)`}
          </dd>
        </div>
        <div>
          <dt>Quem deu</dt>
          <dd>
            {o.buyerName}
            <br />
            <span className="muted small">{o.buyerEmail}</span>
          </dd>
        </div>
        <div>
          <dt>Forma</dt>
          <dd>
            {METHOD_LABEL[o.method]}
            {o.feeCents > 0 && ` · taxa de ${formatBRL(o.feeCents)} paga pelo convidado`}
          </dd>
        </div>
        <div>
          <dt>Criado</dt>
          <dd>{formatDateTime(o.createdAt)}</dd>
        </div>
        <div>
          <dt>Pago</dt>
          <dd>{formatDateTime(o.paidAt)}</dd>
        </div>
        <div>
          <dt>Provedor</dt>
          <dd>
            {o.provider}
            {o.statusDetail && <span className="muted small"> · {o.statusDetail}</span>}
          </dd>
        </div>
        <div>
          <dt>Código</dt>
          <dd className="mono">{o.publicId}</dd>
        </div>
      </dl>
      {o.message && (
        <blockquote className="quote">
          “{o.message}”
          {!o.showOnWall && <span className="muted small"> (pediu para não ir ao mural)</span>}
        </blockquote>
      )}
      {o.canRefund && (
        <div className="actions">
          <button className="button button--danger-ghost" onClick={() => setConfirming(true)}>
            Reembolsar
          </button>
        </div>
      )}
      <Confirm
        open={confirming}
        title="Reembolsar este presente?"
        confirmLabel={`Reembolsar ${formatBRL(o.totalCents)}`}
        danger
        busy={busy}
        onConfirm={refund}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {o.buyerName} recebe {formatBRL(o.totalCents)} de volta pelo provedor de pagamento, as
          cotas voltam para a lista e o recado sai do mural. Não dá para desfazer.
        </p>
      </Confirm>
    </div>
  );
}
