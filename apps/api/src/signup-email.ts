import { SIGNUP_TOKEN_TTL_HOURS } from "@casamento/shared";
import type { MailMessage } from "./mailer.ts";

/* Fase 6, frente B: e-mails do cadastro self-service (pt-BR). TODO(conteudo): nome da plataforma. */

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Link de confirmação no painel (o painel mora no host da API). */
export function signupLink(authUrl: string, token: string): string {
  return `${authUrl.replace(/\/$/, "")}/painel/#/cadastro/${token}`;
}

/** Painel, para quem já tem conta. */
export const painelLink = (authUrl: string) => `${authUrl.replace(/\/$/, "")}/painel/`;

const wrap = (paragraphs: string[]) =>
  [
    `<div style="font-family:system-ui,sans-serif;color:#1f2a37;max-width:520px">`,
    ...paragraphs.map((p) => `<p>${p}</p>`),
    `</div>`,
  ].join("");

/** Confirmação do e-mail: o link define a senha e cria a conta e a organização. */
export function buildSignupEmail(input: {
  to: string;
  name: string;
  organizationName: string;
  link: string;
}): MailMessage {
  const validity = `O link vale por ${SIGNUP_TOKEN_TTL_HOURS} horas e só pode ser usado uma vez.`;
  const hello = `Olá, ${input.name}!`;
  const intro = `Que alegria ter você por aqui. Falta só um passo para criar o espaço de ${input.organizationName}: confirme o seu e-mail e escolha uma senha.`;
  return {
    to: input.to,
    subject: "Confirme seu e-mail para começar",
    text: [
      hello,
      "",
      intro,
      input.link,
      "",
      validity,
      "Se não foi você quem pediu, é só ignorar este e-mail: nada será criado.",
    ].join("\n"),
    html: wrap([
      escapeHtml(hello),
      escapeHtml(intro),
      `<a href="${escapeHtml(input.link)}">Confirmar e criar a conta</a><br><small>${escapeHtml(input.link)}</small>`,
      `${escapeHtml(validity)}<br>Se não foi você quem pediu, é só ignorar este e-mail: nada será criado.`,
    ]),
  };
}

/** Pedido de cadastro com um e-mail que já tem conta: lembra de entrar (sem link de cadastro). */
export function buildSignupExistingEmail(input: { to: string; loginUrl: string }): MailMessage {
  const lines = [
    "Olá!",
    "",
    "Recebemos um pedido de cadastro com este e-mail, mas você já tem uma conta com a gente.",
    `Para entrar, use o painel: ${input.loginUrl}`,
    "",
    "Esqueceu a senha? Peça ajuda a quem administra a sua organização. Se não foi você, é só ignorar este e-mail.",
  ];
  return {
    to: input.to,
    subject: "Você já tem uma conta",
    text: lines.join("\n"),
    html: wrap([
      "Olá!",
      "Recebemos um pedido de cadastro com este e-mail, mas você já tem uma conta com a gente.",
      `Para entrar, use o painel: <a href="${escapeHtml(input.loginUrl)}">${escapeHtml(input.loginUrl)}</a>`,
      "Esqueceu a senha? Peça ajuda a quem administra a sua organização. Se não foi você, é só ignorar este e-mail.",
    ]),
  };
}
