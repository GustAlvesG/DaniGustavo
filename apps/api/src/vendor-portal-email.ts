import { PLATFORM_FOOTER, type MailMessage } from "./mailer.ts";

/*
 * Fase 7, frente C: e-mail com o link mágico do portal do fornecedor (pt-BR). O token vai no
 * fragmento (`/fornecedor/#<token>`): o navegador não o manda ao servidor nem ele cai em log.
 */

export interface VendorPortalEmailInput {
  to: string;
  link: string;
  eventName: string;
  vendorName: string;
  /** Data local "dd/mm/aaaa" até quando o link vale. */
  validUntil: string;
}

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Endereço do portal (mora no host da API, como o painel). */
export function vendorPortalLink(authUrl: string, token: string): string {
  return `${authUrl.replace(/\/$/, "")}/fornecedor/#${token}`;
}

export function buildVendorPortalEmail(input: VendorPortalEmailInput): MailMessage {
  const { eventName, vendorName, link, validUntil } = input;
  const intro = `A organização de ${eventName} abriu para ${vendorName} um portal com o cronograma do dia, as tarefas combinadas com vocês e um espaço para enviar orçamentos e documentos.`;
  const validity = `O link vale até ${validUntil} e pode ser usado quantas vezes precisar. Não o repasse: quem tiver o link entra no portal.`;
  const lines = [
    "Olá!",
    "",
    intro,
    "",
    "Para entrar, abra o link abaixo (não precisa de senha):",
    link,
    "",
    validity,
    "Se você não esperava este e-mail, pode ignorá-lo.",
    "",
    PLATFORM_FOOTER,
  ];
  const html = [
    `<div style="font-family:system-ui,sans-serif;color:#1f2a37;max-width:520px">`,
    `<p>Olá!</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<p>Para entrar, abra o link abaixo (não precisa de senha):</p>`,
    `<p><a href="${escapeHtml(link)}">Abrir o portal do fornecedor</a><br><small>${escapeHtml(link)}</small></p>`,
    `<p>${escapeHtml(validity)}<br>Se você não esperava este e-mail, pode ignorá-lo.</p>`,
    `<p><small>${escapeHtml(PLATFORM_FOOTER)}</small></p>`,
    `</div>`,
  ].join("");
  return {
    to: input.to,
    subject: `Portal do fornecedor: ${eventName}`,
    text: lines.join("\n"),
    html,
    fromName: eventName,
  };
}
