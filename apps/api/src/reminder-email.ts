import type { MailMessage } from "./mailer.ts";

export interface ReminderEmailInput {
  to: string;
  /** Nome do convite, como os noivos o cadastraram (ex.: "Família Souza"). */
  label: string;
  /** Link do convite (SITE_URL/c/token). */
  link: string;
  coupleNames: string;
  weddingDatetime: string;
  timezone: string;
  deadline: string;
}

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const longDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));

/**
 * Lembrete de RSVP, no tom do casal: curto, direto e caloroso. Texto puro e HTML simples
 * (estilos inline, sem imagem externa: funciona em qualquer leitor de e-mail).
 */
export function buildReminderEmail(input: ReminderEmailInput): MailMessage {
  const { label, link, coupleNames, timezone } = input;
  const wedding = longDate(input.weddingDatetime, timezone);
  const deadline = longDate(input.deadline, timezone);

  const subject = `${coupleNames}: falta a resposta de vocês`;
  const paragraphs = [
    `Oi, ${label}!`,
    `Ainda não recebemos a resposta de vocês para o nosso casamento, em ${wedding}. Leva um minuto, e dá para mudar depois se algo mudar.`,
    `Precisamos da resposta até ${deadline} para fechar os números com o buffet. Se não puderem ir, também queremos saber.`,
  ];
  const footer =
    "Você recebe este e-mail porque este endereço está no convite de vocês. Se preferir não receber lembretes, é só responder esta mensagem.";

  const text = [
    ...paragraphs.flatMap((p) => [p, ""]),
    "Responder agora:",
    link,
    "",
    "Um abraço,",
    coupleNames,
    "",
    footer,
  ].join("\n");

  const p = (t: string) =>
    `<p style="margin:0 0 16px;font-size:17px;line-height:1.55;color:#14213d">${escapeHtml(t)}</p>`;
  const html = [
    `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px 12px;background:#e9eef7">`,
    `<div style="max-width:520px;margin:0 auto;background:#fbf8f2;border:1px solid #c7d2e6;font-family:Georgia,'Times New Roman',serif">`,
    `<div style="background:#14213d;padding:28px 24px;text-align:center">`,
    `<div style="font-size:30px;font-style:italic;color:#ffffff;letter-spacing:.5px">${escapeHtml(coupleNames)}</div>`,
    `<div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#92a8d1">${escapeHtml(wedding)}</div>`,
    `</div>`,
    `<div style="padding:28px 24px 8px">`,
    paragraphs.map(p).join(""),
    `<p style="margin:24px 0">`,
    `<a href="${escapeHtml(link)}" style="display:inline-block;background:#14213d;color:#ffffff;text-decoration:none;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:2px;text-transform:uppercase">Responder agora</a>`,
    `</p>`,
    `<p style="margin:0 0 20px;font-size:14px;color:#5b6a85">Se o botão não abrir, copie este endereço:<br><a href="${escapeHtml(link)}" style="color:#3b5a96;word-break:break-all">${escapeHtml(link)}</a></p>`,
    `<p style="margin:0 0 4px;font-size:17px;color:#14213d">Um abraço,</p>`,
    `<p style="margin:0 0 24px;font-size:22px;font-style:italic;color:#14213d">${escapeHtml(coupleNames)}</p>`,
    `</div>`,
    `<div style="border-top:1px solid #c7d2e6;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#5b6a85">${escapeHtml(footer)}</div>`,
    `</div></body></html>`,
  ].join("");

  return { to: input.to, subject, text, html };
}
