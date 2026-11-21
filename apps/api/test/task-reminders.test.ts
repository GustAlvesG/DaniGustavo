import { and, byEvent, eq, eventSettings, eventTasks, taskReminderPrefs } from "@casamento/db";
import type { TaskRemindersView } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer, MailMessage } from "../src/mailer.ts";
import { buildTaskReminderEmail } from "../src/task-reminder-email.ts";
import { isoWeek, runEventTaskReminders, runTaskReminderRound } from "../src/tasks/reminder-job.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";
import { testEnv } from "./helpers.ts";

// Fase 6, frente E: resumo semanal de tarefas por e-mail. Relógio fixo: segunda-feira
// 2030-01-07 09:00 em São Paulo (12:00 UTC). Evento A (org A): owner, member e host.

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send: (m) => {
    sent.push(m);
    return Promise.resolve();
  },
};
let clock = new Date("2030-01-07T12:00:00Z");
const now = () => clock;
const { app, db } = testApp({ mailer, now, revalidate: () => Promise.resolve() });
const env = testEnv();

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const url = (eventId: number, path = "") => `/api/admin/events/${eventId}/tasks/reminders${path}`;
const call = (kind: TestUserKind, eventId: number, method = "GET", body?: unknown) =>
  app.request(url(eventId), {
    method,
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(res: Response) => (await res.json()) as T;

const to = (userKind: TestUserKind) => ev.users[userKind].email;
const mailsTo = (kind: TestUserKind) => sent.filter((m) => m.to === to(kind));
const run = () => runEventTaskReminders({ db, env, mailer, now, ev: ev.eventA });

async function task(
  title: string,
  assignee: TestUserKind | null,
  dueOn: string | null,
  status: "todo" | "doing" | "done" = "todo",
  eventId = ev.eventA.id,
) {
  await db.insert(eventTasks).values({
    eventId,
    title,
    category: "geral",
    status,
    dueOn,
    assigneeUserId: assignee ? ev.users[assignee].id : null,
  });
}

async function resetPrefs() {
  await db.delete(taskReminderPrefs).where(byEvent(taskReminderPrefs, ev.eventA));
  sent.length = 0;
}

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
  // Atrasada e próxima para o dono; só próxima para o membro; só concluída/longe para o anfitrião.
  await task("Atrasada do dono", "owner", "2030-01-02");
  await task("Próxima do dono", "owner", "2030-01-10");
  await task("Próxima do membro", "member", "2030-01-15");
  await task("Concluída do anfitrião", "host", "2030-01-03", "done");
  await task("Longe do anfitrião", "host", "2030-06-01");
  await task("Sem responsável", null, "2030-01-03");
  await task("Sem prazo", "member", null);
});

afterAll(async () => {
  await ev.cleanup();
  await db.$client.end();
});

describe("semana ISO", () => {
  it("calcula a semana da quinta-feira", () => {
    expect(isoWeek("2030-01-07")).toBe("2030-W02");
    expect(isoWeek("2029-12-31")).toBe("2030-W01");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
    expect(isoWeek("2026-11-21")).toBe("2026-W47");
  });
});

describe("e-mail", () => {
  it("lista atrasadas e próximas em pt-BR, com link do painel e sem HTML do usuário", () => {
    const m = buildTaskReminderEmail({
      to: "a@b.c",
      name: "Ana",
      eventName: "Festa <b>",
      overdue: [{ title: "Pagar <script>", dueOn: "2030-01-02" }],
      upcoming: [{ title: "Provar bolo", dueOn: "2030-01-10" }],
      lookaheadDays: 14,
      link: "http://x/painel/#/e/1/tarefas",
    });
    expect(m.subject).toBe("Festa <b>: 1 tarefa atrasada e 1 tarefa para os próximos 14 dias");
    expect(m.text).toContain("Pagar <script> (prazo 02/01/2030)");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.text).toContain("http://x/painel/#/e/1/tarefas");
  });
});

describe("rotina semanal", () => {
  it("envia só para quem tem tarefa atrasada ou próxima, com as tarefas certas", async () => {
    await resetPrefs();
    const r = await run();
    expect(r).toEqual({ sent: 2, failed: 0 });
    const owner = mailsTo("owner");
    expect(owner).toHaveLength(1);
    expect(owner[0]!.text).toContain("Atrasada do dono");
    expect(owner[0]!.text).toContain("Próxima do dono");
    expect(owner[0]!.text).not.toContain("Próxima do membro");
    const member = mailsTo("member");
    expect(member).toHaveLength(1);
    expect(member[0]!.text).toContain("Próxima do membro");
    expect(member[0]!.text).not.toContain("Atrasada");
    expect(mailsTo("host")).toHaveLength(0);
    expect(mailsTo("stranger")).toHaveLength(0);
  });

  it("não repete na mesma semana (nem na rodada seguinte do mesmo dia)", async () => {
    const before = sent.length;
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    clock = new Date("2030-01-07T20:00:00Z");
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(before);
    const [pref] = await db
      .select()
      .from(taskReminderPrefs)
      .where(
        and(byEvent(taskReminderPrefs, ev.eventA), eq(taskReminderPrefs.userId, ev.users.owner.id)),
      );
    expect(pref?.lastWeek).toBe("2030-W02");
    clock = new Date("2030-01-07T12:00:00Z");
  });

  it("na semana seguinte volta a enviar", async () => {
    clock = new Date("2030-01-14T12:00:00Z");
    const r = await run();
    // Dia 14: a atrasada do dono continua; "Próxima do dono" (10/1) agora também está atrasada.
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(mailsTo("owner").length).toBe(2);
    clock = new Date("2030-01-07T12:00:00Z");
  });

  it("só no dia da semana configurado e a partir das 8h locais", async () => {
    await resetPrefs();
    clock = new Date("2030-01-08T12:00:00Z"); // terça
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    clock = new Date("2030-01-07T09:00:00Z"); // segunda, 6h em São Paulo
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(0);
    clock = new Date("2030-01-07T12:00:00Z");
  });

  it("opt-out do evento: nada é enviado", async () => {
    await resetPrefs();
    const off = await call("owner", ev.eventA.id, "PUT", {
      settings: { enabled: false, weekday: 1, lookaheadDays: 14 },
    });
    expect(off.status).toBe(200);
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(0);
    const on = await call("owner", ev.eventA.id, "PUT", {
      settings: { enabled: true, weekday: 1, lookaheadDays: 14 },
    });
    expect(on.status).toBe(200);
  });

  it("opt-out pessoal: só aquela pessoa deixa de receber", async () => {
    await resetPrefs();
    const res = await call("member", ev.eventA.id, "PUT", { mine: { enabled: false } });
    expect(res.status).toBe(200);
    expect((await json<TaskRemindersView>(res)).mine.enabled).toBe(false);
    const r = await run();
    expect(r.sent).toBe(1);
    expect(mailsTo("owner")).toHaveLength(1);
    expect(mailsTo("member")).toHaveLength(0);
    // Reativando, volta (a semana ainda não foi usada por ela).
    await call("member", ev.eventA.id, "PUT", { mine: { enabled: true } });
    expect((await run()).sent).toBe(1);
    expect(mailsTo("member")).toHaveLength(1);
  });

  it("antecedência e dia da semana vêm da configuração do evento", async () => {
    await resetPrefs();
    await call("owner", ev.eventA.id, "PUT", {
      settings: { enabled: true, weekday: 1, lookaheadDays: 3 },
    });
    expect((await run()).sent).toBe(1); // só o dono (atrasada); a do membro é daqui a 8 dias
    expect(mailsTo("member")).toHaveLength(0);
    await call("owner", ev.eventA.id, "PUT", {
      settings: { enabled: true, weekday: 1, lookaheadDays: 14 },
    });
  });

  it("a rodada geral usa o fuso e a configuração de cada evento e não mistura eventos", async () => {
    await resetPrefs();
    // O evento B tem tarefa atrasada para o dono da org B, mas as configurações são do evento.
    await db
      .insert(eventSettings)
      .values({
        eventId: ev.eventB.id,
        key: "tasks.reminders",
        value: { enabled: false, weekday: 1, lookaheadDays: 14 },
        isPublic: false,
      })
      .onDuplicateKeyUpdate({ set: { value: { enabled: false, weekday: 1, lookaheadDays: 14 } } });
    await task("Atrasada do B", "stranger", "2030-01-01", "todo", ev.eventB.id);
    const results = await runTaskReminderRound({ db, env, mailer, now });
    expect(results.get(ev.eventA.id)).toMatchObject({ sent: 2 });
    expect(results.get(ev.eventB.id)).toMatchObject({ sent: 0 });
    expect(mailsTo("stranger")).toHaveLength(0);
    // O e-mail do evento A cita só tarefas do evento A.
    for (const m of mailsTo("owner")) expect(m.text).not.toContain("Atrasada do B");
  });
});

describe("rotas do painel", () => {
  it("GET devolve configuração e preferência pessoal; anfitrião também lê", async () => {
    for (const kind of ["owner", "host"] as const) {
      const res = await call(kind, ev.eventA.id);
      expect(res.status).toBe(200);
      const body = await json<TaskRemindersView>(res);
      expect(body.settings).toMatchObject({ enabled: true, weekday: 1, lookaheadDays: 14 });
      expect(typeof body.mine.enabled).toBe("boolean");
    }
  });

  it("qualquer pessoa do evento muda a própria preferência; configuração do evento exige tasks.write", async () => {
    const own = await call("host", ev.eventA.id, "PUT", { mine: { enabled: false } });
    expect(own.status).toBe(200);
    const denyWrite = await app.request(
      `/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/host-permissions`,
      {
        method: "PUT",
        headers: { cookie: cookies.owner, "Content-Type": "application/json" },
        body: JSON.stringify({ deny: ["tasks.write"] }),
      },
    );
    expect(denyWrite.status).toBe(200);
    const blocked = await call("host", ev.eventA.id, "PUT", {
      settings: { enabled: false, weekday: 2, lookaheadDays: 7 },
    });
    expect(blocked.status).toBe(403);
    // A preferência pessoal continua liberada, e a configuração do evento não mudou.
    expect((await call("host", ev.eventA.id, "PUT", { mine: { enabled: true } })).status).toBe(200);
    const state = await json<TaskRemindersView>(await call("owner", ev.eventA.id));
    expect(state.settings.weekday).toBe(1);
    await app.request(`/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/host-permissions`, {
      method: "PUT",
      headers: { cookie: cookies.owner, "Content-Type": "application/json" },
      body: JSON.stringify({ deny: [] }),
    });
  });

  it("valores inválidos → 422; quem não é do evento → 404", async () => {
    for (const settings of [
      { enabled: true, weekday: 9, lookaheadDays: 14 },
      { enabled: true, weekday: 1, lookaheadDays: 0 },
    ]) {
      expect((await call("owner", ev.eventA.id, "PUT", { settings })).status).toBe(422);
    }
    expect((await call("stranger", ev.eventA.id)).status).toBe(404);
    expect((await call("stranger", ev.eventA.id, "PUT", { mine: { enabled: false } })).status).toBe(
      404,
    );
  });

  it("a preferência de um evento não vaza para outro", async () => {
    const own = await json<TaskRemindersView>(await call("stranger", ev.eventB.id));
    expect(own.mine.enabled).toBe(true);
    await call("stranger", ev.eventB.id, "PUT", { mine: { enabled: false } });
    const [row] = await db
      .select()
      .from(taskReminderPrefs)
      .where(
        and(
          byEvent(taskReminderPrefs, ev.eventA),
          eq(taskReminderPrefs.userId, ev.users.stranger.id),
        ),
      );
    expect(row).toBeUndefined();
  });
});
