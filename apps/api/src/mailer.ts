import nodemailer from "nodemailer";
import type { Env } from "./env.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
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
      await transport.sendMail({ from: env.MAIL_FROM, ...message });
    },
  };
}
