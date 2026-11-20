import type { Invitation } from "@casamento/shared";
import { inEvent } from "./tenancy/modules.ts";
import type { MailMessage } from "./mailer.ts";

export interface RsvpEmailInput {
  to: string;
  invitation: Invitation;
  token: string;
  siteUrl: string;
  /** Nome de exibição do remetente (nome do evento). */
  fromName?: string;
  coupleNames: string;
  /** "O casamento", "A festa"...: vocabulário do evento (padrão: casamento). */
  eventLabel?: string;
  weddingDatetime: string;
  timezone: string;
}

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function formatDate(iso: string, timeZone: string, withTime: boolean): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: withTime ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

/** E-mail de confirmação do RSVP em pt-BR (texto e HTML simples). */
export function buildRsvpEmail(input: RsvpEmailInput): MailMessage {
  const { invitation, token, siteUrl, coupleNames, weddingDatetime, timezone } = input;
  const where = inEvent(input.eventLabel ?? "O casamento");
  const confirmed = invitation.guests
    .filter((g) => g.rsvpStatus === "confirmed")
    .map((g) => g.name);
  const declined = invitation.guests.filter((g) => g.rsvpStatus === "declined").map((g) => g.name);
  const when = formatDate(weddingDatetime, timezone, true);
  const deadline = formatDate(invitation.deadline, timezone, false);
  const link = `${siteUrl.replace(/\/$/, "")}/c/${token}`;

  const subject =
    confirmed.length > 0 ? `Presença confirmada ${where}` : "Recebemos a sua resposta";

  const lines: string[] = [
    confirmed.length > 0
      ? "Recebemos a sua confirmação. Estamos felizes de ter vocês com a gente."
      : "Recebemos a sua resposta. Sentiremos a sua falta.",
    "",
  ];
  if (confirmed.length > 0) lines.push(`Confirmados: ${confirmed.join(", ")}`);
  if (declined.length > 0) lines.push(`Não poderão ir: ${declined.join(", ")}`);
  if (confirmed.length > 0) lines.push("", `Quando: ${when}`);
  lines.push(
    "",
    `Mudou algum plano? Você pode alterar a resposta até ${deadline} neste link:`,
    link,
    "",
    coupleNames,
  );
  const text = lines.join("\n");

  const li = (items: string[]) =>
    `<ul>${items.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`;
  const html = [
    `<div style="font-family:Georgia,serif;color:#1f2a37;max-width:520px">`,
    `<p>${escapeHtml(lines[0] ?? "")}</p>`,
    confirmed.length > 0 ? `<p><strong>Confirmados</strong></p>${li(confirmed)}` : "",
    declined.length > 0 ? `<p><strong>Não poderão ir</strong></p>${li(declined)}` : "",
    confirmed.length > 0 ? `<p><strong>Quando:</strong> ${escapeHtml(when)}</p>` : "",
    `<p>Mudou algum plano? Você pode alterar a resposta até ${escapeHtml(deadline)} neste link:<br>`,
    `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    `<p>${escapeHtml(coupleNames)}</p>`,
    `</div>`,
  ].join("");

  return { to: input.to, fromName: input.fromName, subject, text, html };
}
