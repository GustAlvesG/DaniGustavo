import type { MailMessage } from "./mailer.ts";

/* Fase 6, frente E: e-mail do resumo semanal de tarefas (pt-BR). */

export interface TaskReminderItem {
  title: string;
  /** Prazo "AAAA-MM-DD" (data local do evento). */
  dueOn: string;
}

export interface TaskReminderEmailInput {
  to: string;
  name: string;
  eventName: string;
  overdue: TaskReminderItem[];
  upcoming: TaskReminderItem[];
  lookaheadDays: number;
  /** Link da página de tarefas do evento no painel. */
  link: string;
}

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** "2027-02-20" → "20/02/2027". */
const br = (date: string) => date.split("-").reverse().join("/");

/** Link da página de tarefas do evento (o painel mora no host da API). */
export const tasksLink = (authUrl: string, eventId: number) =>
  `${authUrl.replace(/\/$/, "")}/painel/#/e/${eventId}/tarefas`;

const count = (n: number) => `${n} ${n === 1 ? "tarefa" : "tarefas"}`;

export function buildTaskReminderEmail(input: TaskReminderEmailInput): MailMessage {
  const { overdue, upcoming, eventName, lookaheadDays } = input;
  const parts: string[] = [];
  if (overdue.length)
    parts.push(`${count(overdue.length)} atrasada${overdue.length === 1 ? "" : "s"}`);
  if (upcoming.length)
    parts.push(`${count(upcoming.length)} para os próximos ${lookaheadDays} dias`);
  const subject = `${eventName}: ${parts.join(" e ")}`;
  const line = (i: TaskReminderItem) => `- ${i.title} (prazo ${br(i.dueOn)})`;
  const text = [
    `Olá, ${input.name}!`,
    "",
    `Este é o resumo semanal das suas tarefas em ${eventName}.`,
    ...(overdue.length ? ["", "Atrasadas:", ...overdue.map(line)] : []),
    ...(upcoming.length
      ? ["", `Para os próximos ${lookaheadDays} dias:`, ...upcoming.map(line)]
      : []),
    "",
    "Para ver e concluir as tarefas, abra o painel:",
    input.link,
    "",
    "Não quer mais receber este resumo? Desligue-o na página de tarefas do evento.",
  ].join("\n");
  const list = (title: string, items: TaskReminderItem[]) =>
    items.length
      ? `<p><strong>${escapeHtml(title)}</strong></p><ul>${items
          .map((i) => `<li>${escapeHtml(i.title)} <em>(prazo ${br(i.dueOn)})</em></li>`)
          .join("")}</ul>`
      : "";
  const html = [
    `<div style="font-family:system-ui,sans-serif;color:#1f2a37;max-width:520px">`,
    `<p>Olá, ${escapeHtml(input.name)}!</p>`,
    `<p>Este é o resumo semanal das suas tarefas em ${escapeHtml(eventName)}.</p>`,
    list("Atrasadas", overdue),
    list(`Para os próximos ${lookaheadDays} dias`, upcoming),
    `<p><a href="${escapeHtml(input.link)}">Abrir as tarefas no painel</a></p>`,
    `<p style="color:#6b7280;font-size:13px">Não quer mais receber este resumo? Desligue-o na página de tarefas do evento.</p>`,
    `</div>`,
  ].join("");
  return { to: input.to, subject, text, html, fromName: eventName };
}
