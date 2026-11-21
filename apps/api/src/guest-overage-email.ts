import type { MailMessage } from "./mailer.ts";

/* Fase 7, frente D: e-mail do aviso de convidados acima do limite do plano (pt-BR). */

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export interface GuestOverageEmailInput {
  to: string;
  eventName: string;
  used: number;
  limit: number;
  /** Link do início do painel do evento. */
  link: string;
}

export const dashboardLink = (authUrl: string, eventId: number) =>
  `${authUrl.replace(/\/$/, "")}/painel/#/e/${eventId}`;

export function buildGuestOverageEmail(input: GuestOverageEmailInput): MailMessage {
  const { eventName, used, limit } = input;
  const subject = `${eventName}: a lista passou do limite de convidados do plano`;
  const lines = [
    `A lista de ${eventName} chegou a ${used} pessoas, e o plano permite ${limit}.`,
    "Os acompanhantes que os convidados incluem ao responder contam no limite. As respostas continuam sendo recebidas normalmente, mas novos convidados cadastrados pelo painel serão recusados até a lista voltar ao limite ou o plano ser ampliado.",
    "Para ver a lista ou mudar de plano, abra o painel:",
    input.link,
  ];
  return {
    to: input.to,
    subject,
    text: lines.join("\n\n"),
    html: `<div style="font-family:system-ui,sans-serif;color:#1f2a37;max-width:520px">${lines
      .slice(0, 2)
      .map((l) => `<p>${escapeHtml(l)}</p>`)
      .join("")}<p><a href="${escapeHtml(input.link)}">Abrir o painel do evento</a></p></div>`,
    fromName: eventName,
  };
}
