import { z } from "zod";

/*
 * Mural de recados. O público só vê recados aprovados pelos noivos; nada de e-mail ou
 * dado pessoal sai da API: apenas o nome informado, o texto e a data.
 */

export const MESSAGE_MAX_CHARS = 500;
export const MESSAGE_AUTHOR_MAX_CHARS = 80;

/** Um recado aprovado, como aparece no mural. */
export const WallMessage = z.object({
  author: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type WallMessage = z.infer<typeof WallMessage>;

/** Resposta de GET /api/messages. */
export const WallResponse = z.object({ messages: z.array(WallMessage) });
export type WallResponse = z.infer<typeof WallResponse>;

/** Corpo de POST /api/messages ("Deixe um recado" sem presente). Entra como pendente. */
export const CreateMessageRequest = z.object({
  author: z
    .string()
    .trim()
    .min(2, { error: "Informe seu nome." })
    .max(MESSAGE_AUTHOR_MAX_CHARS, {
      error: `Nome: use até ${MESSAGE_AUTHOR_MAX_CHARS} caracteres.`,
    }),
  body: z
    .string()
    .trim()
    .min(2, { error: "Escreva o seu recado." })
    .max(MESSAGE_MAX_CHARS, { error: `Recado: use até ${MESSAGE_MAX_CHARS} caracteres.` }),
  /** Honeypot: campo escondido que só robô preenche. */
  website: z.string().optional(),
});
export type CreateMessageRequest = z.input<typeof CreateMessageRequest>;

/* ------------------------------------------------------------------------ */
/* Lembretes de RSVP (painel)                                                 */
/* ------------------------------------------------------------------------ */

export const ReminderSettings = z.object({
  enabled: z.boolean(),
  /** Dias antes do prazo do RSVP em que o lembrete automático sai (ex.: [14, 3]). */
  daysBefore: z
    .array(
      z
        .number({ error: "Dias: informe números." })
        .int({ error: "Dias: use números inteiros." })
        .min(1, { error: "Dias: pelo menos 1." })
        .max(120, { error: "Dias: até 120." }),
    )
    .max(6, { error: "Use no máximo 6 datas de lembrete." }),
});
export type ReminderSettings = z.infer<typeof ReminderSettings>;

export interface ReminderStatus extends ReminderSettings {
  /** Convites pendentes com e-mail, ainda dentro do prazo. */
  eligible: number;
  /** Quantos receberiam um lembrete manual agora (elegíveis que ainda não receberam hoje). */
  sendableNow: number;
  /** Convites pendentes sem nenhum e-mail cadastrado. */
  withoutEmail: number;
  /** Prazo do RSVP (ISO). */
  deadline: string;
  /** Datas dos próximos lembretes automáticos. */
  upcoming: { daysBefore: number; at: string }[];
  /** Total de lembretes já enviados. */
  sentTotal: number;
}

export interface ReminderSendResult {
  sent: number;
  failed: number;
}
