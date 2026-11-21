import { PLATFORM_NAME } from "@casamento/shared";
import nodemailer from "nodemailer";
import type { Env } from "./env.ts";

/** Assinatura dos e-mails da própria plataforma (cadastro, assinatura). */
export const PLATFORM_SIGNATURE = `Equipe ${PLATFORM_NAME}`;
/** Rodapé dos e-mails que a plataforma manda em nome de uma organização ou evento. */
export const PLATFORM_FOOTER = `Enviado pelo ${PLATFORM_NAME}.`;

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Nome de exibição do remetente (o nome do evento); o endereço continua o de MAIL_FROM. */
  fromName?: string;
}

/** Remetente: o endereço de MAIL_FROM com o nome do evento, se houver. */
export function fromHeader(mailFrom: string, fromName?: string): string {
  const name = fromName?.replace(/[\r\n"<>\\]/g, " ").trim();
  if (!name) return mailFrom;
  const address = /<([^>]+)>\s*$/.exec(mailFrom)?.[1] ?? mailFrom.trim();
  return `"${name}" <${address}>`;
}

/** Envio de e-mail injetável: SMTP em produção, console sem MAIL_HOST, mock nos testes. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export function createMailer(env: Env): Mailer {
  if (!env.MAIL_HOST) {
    return {
      send(message) {
        console.log(
          `[e-mail simulado] MAIL_HOST vazio. Para: ${message.to}\nAssunto: ${message.subject}\n${message.text}`,
        );
        return Promise.resolve();
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_PORT === 465,
    auth: env.MAIL_USER ? { user: env.MAIL_USER, pass: env.MAIL_PASS ?? "" } : undefined,
  });
  return {
    async send(message) {
      const { fromName, ...rest } = message;
      await transport.sendMail({ from: fromHeader(env.MAIL_FROM, fromName), ...rest });
    },
  };
}
