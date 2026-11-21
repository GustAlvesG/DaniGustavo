import { PRIVACY_REQUEST_KIND_LABELS, type PrivacyRequestKind } from "@casamento/shared";
import type { MailMessage } from "./mailer.ts";

/* E-mails da LGPD (Fase 6, frente C): aviso de pedido novo à equipe e resposta ao titular. */

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const wrap = (paragraphs: string[]) =>
  [
    `<div style="font-family:system-ui,sans-serif;color:#1f2a37;max-width:520px">`,
    ...paragraphs.map((p) => `<p>${escapeHtml(p).replaceAll("\n", "<br>")}</p>`),
    `</div>`,
  ].join("");

/** Para a equipe do evento: chegou um pedido de titular pelo site. */
export function buildPrivacyRequestTeamEmail(input: {
  to: string;
  eventName: string;
  kind: PrivacyRequestKind;
  name: string;
}): MailMessage {
  const what = PRIVACY_REQUEST_KIND_LABELS[input.kind].toLowerCase();
  const lines = [
    "Olá!",
    `${input.name} fez um pedido de privacidade pelo site de ${input.eventName}: "${what}".`,
    "Abra o painel do evento, na página Privacidade, para ver o pedido e responder. A LGPD dá até 15 dias para a resposta.",
    "Por segurança, os dados da pessoa não vão neste e-mail.",
  ];
  return {
    to: input.to,
    fromName: input.eventName,
    subject: `Pedido de privacidade em ${input.eventName}`,
    text: lines.join("\n\n"),
    html: wrap(lines),
  };
}

/** Para o titular: o pedido foi atendido ou recusado, com a resposta da equipe. */
export function buildPrivacyResponseEmail(input: {
  to: string;
  eventName: string;
  name: string;
  status: "done" | "rejected";
  response: string | null;
}): MailMessage {
  const verdict =
    input.status === "done"
      ? "Seu pedido de privacidade foi atendido."
      : "Não conseguimos atender o seu pedido de privacidade.";
  const lines = [
    `Olá, ${input.name}!`,
    verdict,
    ...(input.response ? [input.response] : []),
    `Qualquer dúvida, é só responder a este e-mail ou falar com quem organiza ${input.eventName}.`,
  ];
  return {
    to: input.to,
    fromName: input.eventName,
    subject: `Seu pedido de privacidade — ${input.eventName}`,
    text: lines.join("\n\n"),
    html: wrap(lines),
  };
}
