import type { SubscriptionPaymentStatus, SubscriptionPaymentView } from "@casamento/shared";
import { formatBRL, formatDate } from "../../format.ts";
import { Badge } from "../../ui.tsx";

/* Fase 6, frente A: cobranças da assinatura (página do plano e painel da plataforma). */

const LABEL: Record<SubscriptionPaymentStatus, string> = {
  pending: "Em aberto",
  paid: "Paga",
  overdue: "Vencida",
  refunded: "Estornada",
  canceled: "Cancelada",
};
const TONE: Record<SubscriptionPaymentStatus, string> = {
  pending: "warn",
  paid: "ok",
  overdue: "error",
  refunded: "info",
  canceled: "muted",
};

export function CobrancasAssinatura({ payments }: { payments: SubscriptionPaymentView[] }) {
  if (payments.length === 0) {
    return <p className="empty">Nenhuma cobrança ainda.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="table" data-testid="cobrancas">
        <thead>
          <tr>
            <th scope="col">Vencimento</th>
            <th scope="col">Valor</th>
            <th scope="col">Situação</th>
            <th scope="col">Fatura</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{formatDate(p.dueOn)}</td>
              <td>{formatBRL(p.amountCents)}</td>
              <td>
                <Badge tone={TONE[p.status]}>{LABEL[p.status]}</Badge>
                {p.paidAt ? <span className="muted small"> em {formatDate(p.paidAt)}</span> : null}
              </td>
              <td>
                {p.invoiceUrl && (p.status === "pending" || p.status === "overdue") ? (
                  <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer">
                    Pagar
                  </a>
                ) : p.invoiceUrl ? (
                  <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer">
                    Ver
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
