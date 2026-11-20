import { TEAM_INVITE_TTL_DAYS } from "@casamento/shared";
import type { MailMessage } from "./mailer.ts";

export interface TeamInviteEmailInput {
  to: string;
  /** Link de aceite: `BETTER_AUTH_URL/painel/#/aceitar/<token>`. */
  link: string;
  organizationName: string;
  /** Preenchido no convite de anfitrião. */
  eventName: string | null;
  role: "owner" | "member" | "host";
  inviterName: string | null;
}

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Link do convite no painel (o painel mora no host da API). */
export function teamInviteLink(authUrl: string, token: string): string {
  return `${authUrl.replace(/\/$/, "")}/painel/#/aceitar/${token}`;
}

/** E-mail de convite para a equipe da organização ou para anfitrião de um evento (pt-BR). */
export function buildTeamInviteEmail(input: TeamInviteEmailInput): MailMessage {
  const { organizationName, eventName, role, inviterName, link } = input;
  const what =
    role === "host" && eventName
      ? `administrar o evento ${eventName} pelo painel`
      : role === "owner"
        ? `fazer parte da equipe de ${organizationName} como dono`
        : `fazer parte da equipe de ${organizationName}`;
  const who = inviterName ? `${inviterName} convidou você` : "Você foi convidado";
  const subject =
    role === "host" && eventName
      ? `Convite para o painel de ${eventName}`
      : `Convite para a equipe de ${organizationName}`;
  const validity = `O link vale por ${TEAM_INVITE_TTL_DAYS} dias e só pode ser usado uma vez.`;
  const lines = [
    "Olá!",
    "",
    `${who} para ${what}.`,
    "",
    "Para aceitar, abra o link abaixo. Se você ainda não tem conta, é só criar uma senha; se já tem, entre com este e-mail.",
    link,
    "",
    validity,
    "Se você não esperava este convite, pode ignorar este e-mail.",
  ];
  const html = [
    `<div style="font-family:system-ui,sans-serif;color:#1f2a37;max-width:520px">`,
    `<p>Olá!</p>`,
    `<p>${escapeHtml(who)} para ${escapeHtml(what)}.</p>`,
    `<p>Para aceitar, abra o link abaixo. Se você ainda não tem conta, é só criar uma senha; se já tem, entre com este e-mail.</p>`,
    `<p><a href="${escapeHtml(link)}">Aceitar o convite</a><br><small>${escapeHtml(link)}</small></p>`,
    `<p>${escapeHtml(validity)}<br>Se você não esperava este convite, pode ignorar este e-mail.</p>`,
    `</div>`,
  ].join("");
  return {
    to: input.to,
    subject,
    text: lines.join("\n"),
    html,
    fromName: eventName ?? organizationName,
  };
}
