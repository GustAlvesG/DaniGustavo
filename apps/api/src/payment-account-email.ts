import { PAYMENT_ACCOUNT_STATUS_LABELS, type PaymentAccountStatus } from "@casamento/shared";
import type { MailMessage } from "./mailer.ts";

export interface AccountStatusEmailInput {
  to: string;
  organizationName: string;
  /** Nome da conta (pessoa ou empresa) como cadastrado. */
  accountName: string;
  status: PaymentAccountStatus;
  /** Motivo da recusa informado pelo provedor, se houver. */
  rejectReason: string | null;
  /** Documentos que o provedor ainda espera (títulos). */
  pendingDocuments: string[];
  /** Link do painel (a página de recebimentos). */
  link: string;
}

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Link da página de recebimentos da organização (o painel mora no host da API). */
export const accountStatusLink = (authUrl: string, orgId: number) =>
  `${authUrl.replace(/\/$/, "")}/painel/#/o/${orgId}/recebimentos`;

function headline(status: PaymentAccountStatus, name: string): string {
  switch (status) {
    case "approved":
      return `A conta de recebimento de ${name} foi aprovada. Os presentes em dinheiro já podem ser pagos por ela.`;
    case "rejected":
      return `O cadastro da conta de recebimento de ${name} foi recusado pelo provedor de pagamento.`;
    case "awaiting_approval":
      return `A conta de recebimento de ${name} está em análise pelo provedor de pagamento.`;
    default:
      return `A conta de recebimento de ${name} ainda precisa de informações ou documentos.`;
  }
}

/** E-mail avisando que a situação cadastral de uma subconta mudou (pt-BR). */
export function buildAccountStatusEmail(input: AccountStatusEmailInput): MailMessage {
  const { status, accountName, rejectReason, pendingDocuments, link } = input;
  const label = PAYMENT_ACCOUNT_STATUS_LABELS[status];
  const subject = `Conta de recebimento: ${label.toLowerCase()}`;
  const extra: string[] = [];
  if (status === "rejected" && rejectReason) extra.push(`Motivo informado: ${rejectReason}`);
  if (status !== "approved" && pendingDocuments.length > 0) {
    extra.push(`Documentos pendentes: ${pendingDocuments.join(", ")}.`);
  }
  const open =
    status === "approved"
      ? "Para ver os detalhes, abra o painel:"
      : "Para ver o que falta e enviar os documentos, abra o painel:";
  const text = ["Olá!", "", headline(status, accountName), ...extra, "", open, link].join("\n");
  const html = [
    `<div style="font-family:system-ui,sans-serif;color:#1f2a37;max-width:520px">`,
    `<p>Olá!</p>`,
    `<p>${escapeHtml(headline(status, accountName))}</p>`,
    ...extra.map((e) => `<p>${escapeHtml(e)}</p>`),
    `<p>${escapeHtml(open)}<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    `</div>`,
  ].join("");
  return { to: input.to, subject, text, html, fromName: input.organizationName };
}
