import type { Database } from "@casamento/db";
import type { Env } from "../env.ts";
import type { Mailer } from "../mailer.ts";

/*
 * Fase 6, frente E: resumo semanal de tarefas por e-mail (atrasadas e próximas
 * `lookaheadDays`) para cada responsável, por evento ativo, no dia `weekday` do fuso do evento.
 * Desligado no evento (`tasks.reminders.enabled = false`) ou pela pessoa
 * (`task_reminder_prefs.enabled = false`) → não envia; `last_week` evita repetir na semana.
 * Reservado pela fundação e ligado em server.ts (verifica de hora em hora): hoje não faz nada.
 */
export interface TaskReminderJobDeps {
  env: Env;
  db: Database;
  mailer: Mailer;
  now: () => Date;
}

export function startTaskReminderJob(deps: TaskReminderJobDeps): () => void {
  void deps;
  return () => {};
}
