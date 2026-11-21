import type { PaymentAccountView } from "@casamento/shared";

/**
 * Fase 5, frente D (docs/saas/fase-5.md): cartão da situação cadastral de uma subconta (status,
 * etapas, documentos pendentes com o link de envio do provedor e "Atualizar situação"). As
 * páginas da frente C usam este componente. Reservado pela fundação.
 */
export function SituacaoConta({
  account,
  refreshPath,
  onChange,
}: {
  account: PaymentAccountView;
  /** POST que consulta o provedor agora (ex.: `/payment-accounts/3/refresh`). */
  refreshPath: string;
  onChange?: (account: PaymentAccountView) => void;
}) {
  void refreshPath;
  void onChange;
  return <p className="muted">Situação: {account.status}</p>;
}
