import { eq, events, eventSettings, eventTasks, and } from "@casamento/db";
import type { OrgEventSummary } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 6, frente E: data e fuso do evento pela lista de eventos da organização.

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const schedule = (kind: TestUserKind, orgId: number, eventId: number, body: unknown) =>
  app.request(`/api/admin/orgs/${orgId}/events/${eventId}/schedule`, {
    method: "PATCH",
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
});

afterAll(async () => {
  await ev.cleanup();
  await db.$client.end();
});

describe("PATCH /orgs/:orgId/events/:eventId/schedule", () => {
  it("grava events.starts_at/timezone, as chaves públicas, invalida o resolver e recalcula prazos", async () => {
    const a = ev.eventA;
    // Tarefa com prazo relativo (10 dias antes) e uma de prazo absoluto.
    await db.insert(eventTasks).values([
      {
        eventId: a.id,
        title: "Relativa",
        category: "geral",
        dueOffsetDays: -10,
        dueOn: "2000-01-01",
      },
      { eventId: a.id, title: "Absoluta", category: "geral", dueOn: "2031-05-05" },
    ]);
    // Aquece o cache do resolver da API com a data antiga.
    const listTasks = async () =>
      (await (
        await app.request(`/api/admin/events/${a.id}/tasks`, { headers: { cookie: cookies.owner } })
      ).json()) as { eventDate: string | null };
    expect((await listTasks()).eventDate).not.toBe("2031-06-20");

    const res = await schedule("owner", ev.orgA.id, a.id, {
      date: "2031-06-20",
      time: "18:30",
      timezone: "America/Sao_Paulo",
    });
    expect(res.status).toBe(200);
    const { event } = (await res.json()) as { event: OrgEventSummary };
    expect(event.id).toBe(a.id);
    expect(event.timezone).toBe("America/Sao_Paulo");
    expect(event.startsAt).toBe("2031-06-20T21:30:00.000Z");

    const [row] = await db.select().from(events).where(eq(events.id, a.id));
    expect(row!.startsAt?.toISOString()).toBe("2031-06-20T21:30:00.000Z");

    const settings = await db.select().from(eventSettings).where(eq(eventSettings.eventId, a.id));
    const value = (k: string) => settings.find((s) => s.key === k)?.value;
    expect(value("wedding.datetime")).toBe("2031-06-20T18:30:00-03:00");
    expect(value("wedding.timezone")).toBe("America/Sao_Paulo");

    const tasks = await db
      .select({ title: eventTasks.title, dueOn: eventTasks.dueOn })
      .from(eventTasks)
      .where(eq(eventTasks.eventId, a.id));
    expect(tasks.find((t) => t.title === "Relativa")?.dueOn).toBe("2031-06-10");
    expect(tasks.find((t) => t.title === "Absoluta")?.dueOn).toBe("2031-05-05");
    // O resolver foi invalidado: a API já enxerga a data nova (sem esperar os 60 s do cache).
    expect((await listTasks()).eventDate).toBe("2031-06-20");
  });

  it("mudar o fuso mantém o horário local e a data do calendário segue o fuso novo", async () => {
    const res = await schedule("member", ev.orgA.id, ev.eventA.id, {
      date: "2031-06-20",
      time: "23:00",
      timezone: "America/Noronha",
    });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(events).where(eq(events.id, ev.eventA.id));
    expect(row!.timezone).toBe("America/Noronha");
    expect(row!.startsAt?.toISOString()).toBe("2031-06-21T01:00:00.000Z");
    const [task] = await db
      .select({ dueOn: eventTasks.dueOn })
      .from(eventTasks)
      .where(and(eq(eventTasks.eventId, ev.eventA.id), eq(eventTasks.title, "Relativa")));
    expect(task!.dueOn).toBe("2031-06-10");
  });

  it("entrada inválida → 422; fuso inexistente → 422", async () => {
    const bad = [
      { date: "2031-02-30", time: "10:00", timezone: "America/Sao_Paulo" },
      { date: "2031-06-20", time: "25:00", timezone: "America/Sao_Paulo" },
      { date: "2031-06-20", time: "10:00", timezone: "Marte/Olympus" },
      {},
    ];
    for (const body of bad) {
      expect((await schedule("owner", ev.orgA.id, ev.eventA.id, body)).status).toBe(422);
    }
  });

  it("evento de outra organização → 404 e nada muda", async () => {
    const before = (await db.select().from(events).where(eq(events.id, ev.eventB.id)))[0]!;
    const res = await schedule("owner", ev.orgA.id, ev.eventB.id, {
      date: "2032-01-01",
      time: "10:00",
      timezone: "America/Sao_Paulo",
    });
    expect(res.status).toBe(404);
    // O dono da org B não altera o evento da org A.
    expect(
      (
        await schedule("stranger", ev.orgB.id, ev.eventA.id, {
          date: "2032-01-01",
          time: "10:00",
          timezone: "America/Sao_Paulo",
        })
      ).status,
    ).toBe(404);
    const after = (await db.select().from(events).where(eq(events.id, ev.eventB.id)))[0]!;
    expect(after.startsAt?.getTime()).toBe(before.startsAt?.getTime());
  });

  it("anfitrião não entra na organização (404) e sem sessão → 401", async () => {
    expect(
      (
        await schedule("host", ev.orgA.id, ev.eventA.id, {
          date: "2032-01-01",
          time: "10:00",
          timezone: "America/Sao_Paulo",
        })
      ).status,
    ).toBe(404);
    const res = await app.request(`/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/schedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });
});
