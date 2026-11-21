import { ALERT_COOLDOWN_MINUTES } from "@casamento/shared";
import type { Env } from "./env.ts";
import { describeError, scrubText, type Logger } from "./log.ts";
import type { Mailer } from "./mailer.ts";

/*
 * Alertas da plataforma por e-mail (Fase 6, frente D): rotina que falhou e erro 5xx vão para
 * `PLATFORM_ALERT_EMAIL`. O mesmo alerta (mesma chave) não sai de novo antes de
 * `ALERT_COOLDOWN_MINUTES`; os repetidos nesse meio-tempo são contados e entram no próximo.
 * Sem e-mail configurado, não faz nada (o log já registra o erro). O texto passa pelo mesmo
 * filtro do log: nada de e-mail, CPF ou telefone de convidado.
 */

export interface AlertInput {
  /** Agrupa os repetidos (ex.: "rotina:expiração", "http:GET /api/e/:id/site"). */
  key: string;
  /** Uma linha, vai no assunto. */
  title: string;
  error?: unknown;
  /** Detalhes extras (sem dado pessoal). */
  detail?: string;
}

export interface Alerter {
  /** true se o e-mail saiu agora; false se está desligado ou dentro do intervalo. */
  notify(alert: AlertInput): Promise<boolean>;
}

export interface AlerterOptions {
  env: Pick<Env, "PLATFORM_ALERT_EMAIL" | "NODE_ENV">;
  mailer: Mailer;
  logger?: Logger;
  now?: () => Date;
  cooldownMs?: number;
}

/** Não faz nada (testes e quem não precisa de alerta). */
export const noAlerts: Alerter = { notify: () => Promise.resolve(false) };

export function createAlerter({
  env,
  mailer,
  logger,
  now = () => new Date(),
  cooldownMs = ALERT_COOLDOWN_MINUTES * 60_000,
}: AlerterOptions): Alerter {
  const to = env.PLATFORM_ALERT_EMAIL;
  /** chave → quando o último saiu e quantos foram segurados desde então. */
  const sent = new Map<string, { at: number; held: number }>();

  return {
    async notify({ key, title, error, detail }) {
      if (!to) return false;
      const t = now().getTime();
      const last = sent.get(key);
      if (last && t - last.at < cooldownMs) {
        last.held += 1;
        return false;
      }
      const held = last?.held ?? 0;
      sent.set(key, { at: t, held: 0 });
      // Limite de memória: chaves velhas saem (um 5xx por caminho cria uma chave cada).
      if (sent.size > 500) {
        for (const [k, v] of sent) if (t - v.at >= cooldownMs) sent.delete(k);
      }

      const err = error === undefined ? null : describeError(error);
      const lines = [
        `Alerta da plataforma (${env.NODE_ENV}): ${scrubText(title, 200)}`,
        `Quando: ${new Date(t).toISOString()}`,
        ...(held > 0 ? [`Repetições seguradas desde o último aviso: ${held}.`] : []),
        ...(detail ? ["", scrubText(detail, 2000)] : []),
        ...(err
          ? [
              "",
              `Erro: ${String(err.error)}${err.message ? `: ${String(err.message)}` : ""}`,
              ...((err.stack as string[] | undefined) ?? []),
            ]
          : []),
        "",
        `Alertas iguais ficam ${Math.round(cooldownMs / 60_000)} min sem novo e-mail. Detalhes no log da API.`,
      ];
      try {
        await mailer.send({
          to,
          fromName: "Plataforma",
          subject: `[alerta] ${scrubText(title, 120)}`,
          text: lines.join("\n"),
          html: `<pre style="font-family:monospace;white-space:pre-wrap">${lines
            .join("\n")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")}</pre>`,
        });
        return true;
      } catch (mailErr) {
        // Não derruba quem alertou; libera para tentar de novo no próximo.
        sent.delete(key);
        logger?.error("falha ao enviar alerta", { key, ...describeError(mailErr) });
        return false;
      }
    },
  };
}
