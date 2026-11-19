import {
  account,
  and,
  eq,
  eventMembers,
  eventSettings,
  guests,
  inArray,
  invitations,
  LEGACY_EVENT_ID,
  newPublicId,
  rsvpReminders,
  user,
} from "@casamento/db";
import type { ReminderStatus } from "@casamento/shared";
import { hashPassword } from "better-auth/crypto";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer, MailMessage } from "../src/mailer.ts";
import { buildReminderEmail } from "../src/reminder-email.ts";
import {
  DEFAULT_REMINDER_SETTINGS,
  dueAutoKind,
  readReminderSettings,
  reminderStatus,
  runAutoReminders,
  saveReminderSettings,
  sendRemindersNow,
} from "../src/reminders.ts";
import { resolverFor } from "../src/tenancy/resolver.ts";
import { testApp } from "./helpers.ts";

// Usa o banco de testes da API (global-setup: migrado e com seed). Cria convites próprios (e-mails
// únicos) e restringe as rodadas a eles (`only`), sem tocar nos convites reais. A
// configuração dos lembretes é restaurada no fim.

const run = Date.now().toString(36);
const sent: MailMessage[] = [];
let failNext = false;
const mailer: Mailer = {
  send(m) {
    if (failNext) {
      failNext = false;
      return Promise.reject(new Error("SMTP fora do ar"));
    }
    sent.push(m);
    return Promise.resolve();
  },
};
let clock = new Date("2027-01-01T12:00:00-03:00");
const { app, db, env } = testApp({ mailer, now: () => clock });
const ev = (await resolverFor(db).byId(LEGACY_EVENT_ID))!;
const DEADLINE = new Date("2027-03-10T23:59:59-03:00");
const day = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

const created: number[] = [];
const ids: Record<string, number> = {};
const emailOf = (k: string) => `${k}-${run}@exemplo.com`;
let originalSettings: unknown;

async function invite(key: string, opts: { email?: string; status?: "pending" | "confirmed" }) {
  const [res] = await db.insert(invitations).values({
    token: newPublicId(),
    label: `Lembrete ${key} ${run}`,
    side: "dani",
    maxGuests: 2,
    contactEmail: opts.email ?? null,
  });
  created.push(res.insertId);
  ids[key] = res.insertId;
  await db.insert(guests).values({
    invitationId: res.insertId,
    name: `Convidado ${key}`,
    rsvpStatus: opts.status ?? "pending",
  });
}

const deps = () => ({ ev, env, db, mailer, now: () => clock, only: created });
const to = () => sent.map((m) => m.to).filter((t) => t.endsWith(`-${run}@exemplo.com`));
const clearSent = () =>
  db.delete(rsvpReminders).where(inArray(rsvpReminders.invitationId, created));

beforeAll(async () => {
  const [row] = await db
    .select()
    .from(eventSettings)
    .where(and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "reminders")));
  originalSettings = row?.value;
  await invite("a", { email: emailOf("a") });
  await invite("b", { email: emailOf("b") });
  await invite("sem", {});
  await invite("resp", { email: emailOf("resp"), status: "confirmed" });
  await saveReminderSettings(ev, db, DEFAULT_REMINDER_SETTINGS);
});

afterAll(async () => {
  await db.delete(invitations).where(inArray(invitations.id, created)); // cascade nos lembretes
  if (originalSettings === undefined) {
    await db
      .delete(eventSettings)
      .where(and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "reminders")));
  } else {
    await saveReminderSettings(ev, db, originalSettings as typeof DEFAULT_REMINDER_SETTINGS);
  }
  await db.$client.end();
});

describe("agenda por dias antes do prazo", () => {
  it("dueAutoKind escolhe a data mais recente já alcançada", () => {
    const d = [14, 3];
    expect(dueAutoKind(d, DEADLINE, day("2027-02-20"))).toBeNull(); // 18 dias antes
    expect(dueAutoKind(d, DEADLINE, day("2027-02-25"))).toBe("auto:14");
    expect(dueAutoKind(d, DEADLINE, day("2027-03-05"))).toBe("auto:14"); // 5 dias antes
    expect(dueAutoKind(d, DEADLINE, day("2027-03-08"))).toBe("auto:3");
    expect(dueAutoKind(d, DEADLINE, day("2027-03-11"))).toBeNull(); // prazo passou
    expect(dueAutoKind([], DEADLINE, day("2027-03-08"))).toBeNull();
  });

  it("antes da primeira data não envia nada", async () => {
    clock = day("2027-02-20");
    expect(await runAutoReminders(deps())).toEqual({ sent: 0, failed: 0 });
    expect(to()).toEqual([]);
  });

  it("14 dias antes: envia só a pendentes com e-mail, e uma vez só", async () => {
    clock = day("2027-02-25");
    const r = await runAutoReminders(deps());
    expect(r).toEqual({ sent: 2, failed: 0 });
    expect(to().sort()).toEqual([emailOf("a"), emailOf("b")]);
    // Rodar de novo (job de hora em hora, reinício da API) não duplica.
    expect(await runAutoReminders(deps())).toEqual({ sent: 0, failed: 0 });
    clock = day("2027-02-26");
    expect(await runAutoReminders(deps())).toEqual({ sent: 0, failed: 0 });
    expect(to()).toHaveLength(2);
  });

  it("3 dias antes: segundo lembrete, e quem já respondeu fica de fora", async () => {
    await db.update(guests).set({ rsvpStatus: "declined" }).where(eq(guests.invitationId, ids.b!));
    clock = day("2027-03-08");
    const r = await runAutoReminders(deps());
    expect(r.sent).toBe(1);
    expect(to().filter((t) => t === emailOf("a"))).toHaveLength(2);
    expect(to().filter((t) => t === emailOf("b"))).toHaveLength(1);
    expect(await runAutoReminders(deps())).toEqual({ sent: 0, failed: 0 });
  });

  it("depois do prazo não envia", async () => {
    clock = day("2027-03-12");
    expect(await runAutoReminders(deps())).toEqual({ sent: 0, failed: 0 });
    expect((await sendRemindersNow(deps())).sent).toBe(0);
  });
});

describe("liga/desliga e configuração", () => {
  it("desligado, o automático não envia (e o manual ainda funciona)", async () => {
    await saveReminderSettings(ev, db, { enabled: false, daysBefore: [14, 3] });
    await clearSent();
    await db.update(guests).set({ rsvpStatus: "pending" }).where(eq(guests.invitationId, ids.b!));
    sent.length = 0;
    clock = day("2027-03-08");
    expect(await runAutoReminders(deps())).toEqual({ sent: 0, failed: 0 });
    expect(to()).toEqual([]);
    expect((await sendRemindersNow(deps())).sent).toBe(2);
  });

  it("datas configuradas são ordenadas e sem repetição; padrão 14 e 3", async () => {
    await saveReminderSettings(ev, db, { enabled: true, daysBefore: [3, 7, 7, 30] });
    expect((await readReminderSettings(ev, db)).daysBefore).toEqual([30, 7, 3]);
    await db
      .delete(eventSettings)
      .where(and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "reminders")));
    expect(await readReminderSettings(ev, db)).toEqual({ enabled: true, daysBefore: [14, 3] });
    await saveReminderSettings(ev, db, DEFAULT_REMINDER_SETTINGS);
  });
});

describe("envio manual", () => {
  it("conta antes de enviar e não repete no mesmo dia", async () => {
    await clearSent();
    sent.length = 0;
    clock = day("2027-02-01");
    const status: ReminderStatus = await reminderStatus(deps());
    expect(status.sendableNow).toBe(2);
    expect(status.eligible).toBe(2);
    expect(status.withoutEmail).toBe(1);
    expect(status.upcoming.map((u) => u.daysBefore)).toEqual([14, 3]);

    expect(await sendRemindersNow(deps())).toEqual({ sent: 2, failed: 0 });
    expect(await sendRemindersNow(deps())).toEqual({ sent: 0, failed: 0 });
    expect((await reminderStatus(deps())).sendableNow).toBe(0);
    // Convites que acabaram de receber esperam 24 h, mesmo no automático.
    clock = new Date(clock.getTime() + 2 * 3600_000);
    expect(await runAutoReminders(deps())).toEqual({ sent: 0, failed: 0 });
  });

  it("falha no SMTP não conta como enviado e pode ser tentada de novo", async () => {
    await clearSent();
    sent.length = 0;
    failNext = true;
    clock = day("2027-02-01");
    expect(await sendRemindersNow(deps())).toEqual({ sent: 1, failed: 1 });
    expect(await sendRemindersNow(deps())).toEqual({ sent: 1, failed: 0 });
  });
});

describe("e-mail", () => {
  it("é curto, tem o link do convite e o prazo, e escapa HTML", () => {
    const m = buildReminderEmail({
      to: "x@exemplo.com",
      label: "Família <b>Souza</b>",
      link: "http://localhost:3000/c/ABC",
      coupleNames: "Dani & Gustavo",
      weddingDatetime: "2027-04-10T16:00:00-03:00",
      timezone: "America/Sao_Paulo",
      deadline: DEADLINE.toISOString(),
    });
    expect(m.text).toContain("http://localhost:3000/c/ABC");
    expect(m.text).toContain("10 de abril de 2027");
    expect(m.text).toContain("10 de março de 2027");
    expect(m.html).toContain('href="http://localhost:3000/c/ABC"');
    expect(m.html).not.toContain("<b>Souza</b>");
    expect(m.text.split("\n").length).toBeLessThan(20);
  });
});

describe("painel (/api/admin/reminders)", () => {
  const email = `lembretes-${run}@exemplo.com`;
  const userId = ulid();
  let cookie = "";
  const admin = (path: string, init: RequestInit = {}) =>
    app.request(`/api/admin/events/${ev.id}/reminders${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
    });

  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Teste", email, emailVerified: true });
    await db.insert(eventMembers).values({ eventId: ev.id, userId, role: "host" });
    await db.insert(account).values({
      id: ulid(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword("senha-de-teste-123"),
    });
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `198.51.100.${run.length + 40}`,
      },
      body: JSON.stringify({ email, password: "senha-de-teste-123" }),
    });
    cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  it("exige sessão", async () => {
    const saved = cookie;
    cookie = "";
    expect((await admin("")).status).toBe(401);
    expect((await admin("/send", { method: "POST" })).status).toBe(401);
    cookie = saved;
  });

  it("lê e salva a configuração, validando os dias", async () => {
    clock = day("2027-02-01");
    const ok = await admin("", {
      method: "PUT",
      body: JSON.stringify({ enabled: false, daysBefore: [10, 2] }),
    });
    expect(ok.status).toBe(200);
    const status = (await ok.json()) as ReminderStatus;
    expect(status.enabled).toBe(false);
    expect(status.daysBefore).toEqual([10, 2]);
    const bad = await admin("", {
      method: "PUT",
      body: JSON.stringify({ enabled: true, daysBefore: [0] }),
    });
    expect(bad.status).toBe(422);
    await saveReminderSettings(ev, db, DEFAULT_REMINDER_SETTINGS);
  });
});
