import { PAST_DUE_GRACE_DAYS, PLATFORM_NAME } from "@casamento/shared";
import { PLATFORM_SIGNATURE, type MailMessage } from "./mailer.ts";

/*
 * Fase 6, frente A: avisos da assinatura para os donos da organização (pt-BR). O site dos
 * convidados nunca sai do ar por inadimplência: o texto deixa isso claro.
 */

export type SubscriptionEmailKind = "past_due" | "paid" | "trial_ended";

export interface SubscriptionEmailInput {
  to: string;
  organizationName: string;
  planName: string;
  kind: SubscriptionEmailKind;
  /** Fatura em aberto (onde pagar), se houver. */
  invoiceUrl: string | null;
  /** Página "Plano e assinatura" no painel. */
  link: string;
}

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Link da página do plano da organização (o painel mora no host da API). */
export const subscriptionLink = (authUrl: string, orgId: number) =>
  `${authUrl.replace(/\/$/, "")}/painel/#/o/${orgId}/plano`;

function lines(input: SubscriptionEmailInput): { subject: string; body: string[] } {
  const { organizationName: org, planName: plan } = input;
  const grace = `Você tem ${PAST_DUE_GRACE_DAYS} dias para regularizar; depois disso o painel fica só para consulta até o pagamento. O site dos convidados, as confirmações de presença e os presentes continuam funcionando normalmente.`;
  switch (input.kind) {
    case "paid":
      return {
        subject: "Pagamento da assinatura confirmado",
        body: [
          `Recebemos o pagamento da assinatura do ${PLATFORM_NAME} de ${org} (plano ${plan}). Obrigado!`,
        ],
      };
    case "trial_ended":
      return {
        subject: "O período de teste terminou",
        body: [
          `O período de teste de ${org} (plano ${plan}) terminou e ainda não há pagamento da assinatura.`,
          grace,
        ],
      };
    default:
      return {
        subject: "Pagamento da assinatura em atraso",
        body: [
          `A cobrança da assinatura de ${org} (plano ${plan}) venceu e ainda não foi paga.`,
          grace,
        ],
      };
  }
}

export function buildSubscriptionEmail(input: SubscriptionEmailInput): MailMessage {
  const { subject, body } = lines(input);
  const pay = input.kind !== "paid" && input.invoiceUrl ? input.invoiceUrl : null;
  const text = [
    "Olá!",
    "",
    ...body,
    ...(pay ? ["", "Para pagar, abra a fatura:", pay] : []),
    "",
    "Para ver o plano e as cobranças, abra o painel:",
    input.link,
    "",
    PLATFORM_SIGNATURE,
  ].join("\n");
  const html = [
    `<div style="font-family:system-ui,sans-serif;color:#1f2a37;max-width:520px">`,
    `<p>Olá!</p>`,
    ...body.map((b) => `<p>${escapeHtml(b)}</p>`),
    pay
      ? `<p>Para pagar, abra a fatura:<br><a href="${escapeHtml(pay)}">${escapeHtml(pay)}</a></p>`
      : "",
    `<p>Para ver o plano e as cobranças, abra o painel:<br><a href="${escapeHtml(input.link)}">${escapeHtml(input.link)}</a></p>`,
    `<p>${escapeHtml(PLATFORM_SIGNATURE)}</p>`,
    `</div>`,
  ].join("");
  return { to: input.to, subject, text, html, fromName: PLATFORM_NAME };
}
