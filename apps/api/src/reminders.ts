import {
  and,
  asc,
  eq,
  eventSettings,
  guests,
  inArray,
  invitations,
  LEGACY_EVENT_ID,
  rsvpReminders,
  type Database,
} from "@casamento/db";
import { ReminderSettings, type ReminderSendResult, type ReminderStatus } from "@casamento/shared";
import { invitationLink, invitationStatus } from "./admin/invitations.ts";
import type { Env } from "./env.ts";
import type { Mailer } from "./mailer.ts";
import { buildReminderEmail } from "./reminder-email.ts";

/*
 * Lembretes de RSVP por e-mail (Fase 6). Quem recebe: convites ainda pendentes (ninguém
 * respondeu), com e-mail (o de contato do convite ou, na falta, o de um convidado), antes
 * do prazo. Cada lembrete é registrado em `rsvp_reminders`; a chave única (convite, tipo)
 * garante que o mesmo lembrete nunca sai duas vezes, mesmo com dois processos ou cliques.
 */

const DAY = 24 * 60 * 60_000;
/** Depois de um lembrete, o mesmo convite não recebe outro por este tempo (automático ou manual). */
export const REMINDER_COOLDOWN_MS = DAY;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, daysBefore: [14, 3] };
const SETTINGS_KEY = "reminders";

export interface ReminderDeps {
  env: Env;
  db: Database;
  mailer: Mailer;
  now: () => Date;
  /** Só estes convites (ids). Usado nos testes, para não mexer nos convites reais do banco. */
  only?: number[];
}

/** Configuração dos lembretes (padrão: ligado, 14 e 3 dias antes do prazo). */
export async function readReminderSettings(db: Database): Promise<ReminderSettings> {
  const [row] = await db
    .select()
    .from(eventSettings)
    .where(and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, SETTINGS_KEY)));
  const parsed = ReminderSettings.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_REMINDER_SETTINGS;
}

export async function saveReminderSettings(db: Database, value: ReminderSettings): Promise<void> {
  const clean: ReminderSettings = {
    enabled: value.enabled,
    daysBefore: [...new Set(value.daysBefore)].sort((a, b) => b - a),
  };
  // Privada (is_public = false): não entra em GET /api/site.
  await db
    .insert(eventSettings)
    .values({ eventId: LEGACY_EVENT_ID, key: SETTINGS_KEY, value: clean, isPublic: false })
    .onDuplicateKeyUpdate({ set: { value: clean, updatedAt: new Date() } });
}

async function readDeadline(db: Database): Promise<Date> {
  const [row] = await db
    .select()
    .from(eventSettings)
    .where(and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "rsvp.deadline")));
  return new Date(String(row?.value));
}

async function readCouple(db: Database) {
  const rows = await db
    .select()
    .from(eventSettings)
    .where(
      and(
        eq(eventSettings.eventId, LEGACY_EVENT_ID),
        inArray(eventSettings.key, ["couple.names", "wedding.datetime", "wedding.timezone"]),
      ),
    );
  const get = (k: string) => String(rows.find((r) => r.key === k)?.value ?? "");
  return {
    names: get("couple.names") || "Dani & Gustavo",
    datetime: get("wedding.datetime"),
    timezone: get("wedding.timezone") || "America/Sao_Paulo",
  };
}
type Couple = Awaited<ReturnType<typeof readCouple>>;

export interface Candidate {
  invitationId: number;
  token: string;
  label: string;
  email: string;
  /** Quando saiu o último lembrete (qualquer tipo), se algum. */
  lastSentAt: Date | null;
  sentKinds: Set<string>;
}

/** Convites pendentes, separados entre com e sem e-mail. */
async function loadPending(db: Database, only?: number[]) {
  const [invs, gs, sent] = await Promise.all([
    db.select().from(invitations).orderBy(asc(invitations.label)),
    db.select().from(guests).orderBy(asc(guests.isPlusOne), asc(guests.id)),
    db.select().from(rsvpReminders),
  ]);
  const withEmail: Candidate[] = [];
  let withoutEmail = 0;
  for (const inv of invs) {
    if (only && !only.includes(inv.id)) continue;
    const list = gs.filter((g) => g.invitationId === inv.id);
    if (invitationStatus(list) !== "pending") continue;
    const email = inv.contactEmail?.trim() || list.find((g) => g.email?.trim())?.email?.trim();
    if (!email) {
      withoutEmail++;
      continue;
    }
    const mine = sent.filter((s) => s.invitationId === inv.id);
    withEmail.push({
      invitationId: inv.id,
      token: inv.token,
      label: inv.label,
      email,
      lastSentAt: mine.reduce<Date | null>(
        (last, s) => (!last || s.sentAt > last ? s.sentAt : last),
        null,
      ),
      sentKinds: new Set(mine.map((s) => s.kind)),
    });
  }
  return { withEmail, withoutEmail, sentTotal: sent.length };
}

/** "2027-02-20" no fuso do casamento: um lembrete manual por convite por dia. */
function localDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const coolingDown = (c: Candidate, now: Date) =>
  c.lastSentAt !== null && now.getTime() - c.lastSentAt.getTime() < REMINDER_COOLDOWN_MS;

/**
 * Tipo do lembrete automático devido agora: o da data mais recente já alcançada
 * ("auto:14" depois de 14 dias antes do prazo, "auto:3" depois de 3 dias antes...). Se o job
 * ficou parado e duas datas passaram, só a última vale (ninguém recebe dois de uma vez).
 */
export function dueAutoKind(daysBefore: number[], deadline: Date, now: Date): string | null {
  if (Number.isNaN(deadline.getTime()) || now >= deadline) return null;
  const reached = daysBefore
    .filter((d) => now.getTime() >= deadline.getTime() - d * DAY)
    .sort((a, b) => a - b);
  return reached.length ? `auto:${reached[0]}` : null;
}

/** Quantos receberiam um lembrete manual agora, e o resumo para o painel. */
export async function reminderStatus(deps: ReminderDeps): Promise<ReminderStatus> {
  const { db, now } = deps;
  const [cfg, deadline, pending] = await Promise.all([
    readReminderSettings(db),
    readDeadline(db),
    loadPending(db, deps.only),
  ]);
  const valid = !Number.isNaN(deadline.getTime());
  const open = valid && now() < deadline;
  return {
    ...cfg,
    eligible: open ? pending.withEmail.length : 0,
    sendableNow: open ? pending.withEmail.filter((c) => !coolingDown(c, now())).length : 0,
    withoutEmail: pending.withoutEmail,
    deadline: valid ? deadline.toISOString() : "",
    upcoming: valid
      ? cfg.daysBefore
          .map((d) => ({ daysBefore: d, at: new Date(deadline.getTime() - d * DAY) }))
          .filter((u) => u.at > now())
          .sort((a, b) => a.at.getTime() - b.at.getTime())
          .map((u) => ({ daysBefore: u.daysBefore, at: u.at.toISOString() }))
      : [],
    sentTotal: pending.sentTotal,
  };
}

function isDuplicate(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY";
}

/**
 * Reserva o (convite, tipo), manda o e-mail e, se o envio falhar, devolve a reserva para
 * poder tentar de novo na próxima rodada. A reserva vem antes do envio: se duas rodadas
 * correrem juntas, só uma consegue inserir e a outra pula.
 */
async function sendOne(
  deps: ReminderDeps,
  c: Candidate,
  kind: string,
  ctx: { couple: Couple; deadline: Date },
): Promise<"sent" | "skipped" | "failed"> {
  const { db, mailer, env, now } = deps;
  try {
    await db.insert(rsvpReminders).values({ invitationId: c.invitationId, kind, sentAt: now() });
  } catch (err) {
    if (isDuplicate(err)) return "skipped";
    throw err;
  }
  try {
    await mailer.send(
      buildReminderEmail({
        to: c.email,
        label: c.label,
        link: invitationLink(env.SITE_URL, c.token),
        coupleNames: ctx.couple.names,
        weddingDatetime: ctx.couple.datetime,
        timezone: ctx.couple.timezone,
        deadline: ctx.deadline.toISOString(),
      }),
    );
    return "sent";
  } catch (err) {
    console.error(`[lembretes] Falha ao enviar para o convite ${c.invitationId}:`, err);
    await db
      .delete(rsvpReminders)
      .where(and(eq(rsvpReminders.invitationId, c.invitationId), eq(rsvpReminders.kind, kind)));
    return "failed";
  }
}

async function sendAll(
  deps: ReminderDeps,
  kind: string,
  pending: Candidate[],
  ctx: { couple: Couple; deadline: Date },
): Promise<ReminderSendResult> {
  const result: ReminderSendResult = { sent: 0, failed: 0 };
  for (const c of pending) {
    if (c.sentKinds.has(kind) || coolingDown(c, deps.now())) continue;
    const r = await sendOne(deps, c, kind, ctx);
    if (r === "sent") result.sent++;
    if (r === "failed") result.failed++;
  }
  return result;
}

/** Rodada do lembrete automático (chamada pelo job). Não faz nada se estiver desligado. */
export async function runAutoReminders(deps: ReminderDeps): Promise<ReminderSendResult> {
  const { db, now } = deps;
  const cfg = await readReminderSettings(db);
  if (!cfg.enabled) return { sent: 0, failed: 0 };
  const deadline = await readDeadline(db);
  const kind = dueAutoKind(cfg.daysBefore, deadline, now());
  if (!kind) return { sent: 0, failed: 0 };
  const [pending, couple] = await Promise.all([loadPending(db, deps.only), readCouple(db)]);
  return sendAll(deps, kind, pending.withEmail, { couple, deadline });
}

/** "Enviar lembretes agora" (botão do painel): vale também com o automático desligado. */
export async function sendRemindersNow(deps: ReminderDeps): Promise<ReminderSendResult> {
  const { db, now } = deps;
  const deadline = await readDeadline(db);
  if (Number.isNaN(deadline.getTime()) || now() >= deadline) return { sent: 0, failed: 0 };
  const [pending, couple] = await Promise.all([loadPending(db, deps.only), readCouple(db)]);
  const kind = `manual:${localDay(now(), couple.timezone)}`;
  return sendAll(deps, kind, pending.withEmail, { couple, deadline });
}
