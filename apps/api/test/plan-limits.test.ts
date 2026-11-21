import {
  and,
  eq,
  events,
  guests,
  invitations,
  organizationUsage,
  teamInvites,
} from "@casamento/db";
import { COURTESY_PLAN_CODE, ERROR_CODES, limitMessage } from "@casamento/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { checkPlanLimit } from "../src/plans/limits.ts";
import { createTestEvents, testApp, type TestEvents } from "./helpers.ts";
import { clearSubscription, createPlan, dropPlans, setSubscription } from "./plan-fixtures.ts";

/*
 * Fase 6, frente A: limites do plano aplicados na API (409 `plan_limit` com a mensagem pt-BR).
 * Sem assinatura (legado) e Cortesia: sem limite. Trocar para plano menor que o uso → 409.
 */

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const TIGHT = `t-lim-${run}`;
const WIDE = `t-wide-${run}`;
const MB = 1024 * 1024;

let T: TestEvents;
let owner = "";

// PNG de 1×1 (o upload confere o tipo pelos bytes).
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (ch) => ch.charCodeAt(0),
);

const json = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { cookie: owner, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function expectLimit(
  res: Response,
  kind: Parameters<typeof limitMessage>[0],
  limit: number | null,
) {
  expect(res.status).toBe(409);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe(ERROR_CODES.planLimit);
  expect(body.error.message).toBe(limitMessage(kind, limit));
}

const invitation = (n: number) => ({
  label: `Família Limite ${n}`,
  side: "noiva",
  maxGuests: Math.max(1, n),
  guests: Array.from({ length: n }, (_, i) => ({ name: `Pessoa ${i + 1}` })),
});

beforeAll(async () => {
  T = await createTestEvents(db);
  owner = await T.login(app, "owner");
  await createPlan(db, {
    code: TIGHT,
    limits: {
      activeEvents: 1,
      guestsPerEvent: 2,
      members: 2,
      storageMb: 1,
      modules: ["rsvp", "gifts"],
    },
  });
  await createPlan(db, { code: WIDE });
});

beforeEach(async () => {
  await clearSubscription(db, T.orgA.id);
  await db.delete(guests).where(eq(guests.eventId, T.eventA.id));
  await db.delete(invitations).where(eq(invitations.eventId, T.eventA.id));
  await db.delete(teamInvites).where(eq(teamInvites.organizationId, T.orgA.id));
});

afterAll(async () => {
  await db.delete(guests).where(eq(guests.eventId, T.eventA.id));
  await db.delete(invitations).where(eq(invitations.eventId, T.eventA.id));
  await T.cleanup();
  await dropPlans(db, [TIGHT, WIDE]);
  await db.$client.end();
});

describe("eventos ativos", () => {
  it("ativar um segundo evento passa do limite → 409; sem assinatura e na Cortesia, passa", async () => {
    const activate = () =>
      json("PATCH", `/api/admin/orgs/${T.orgA.id}/events/${T.draftA.id}`, { status: "active" });
    const backToDraft = () =>
      db
        .update(events)
        .set({ status: "draft" })
        .where(and(eq(events.id, T.draftA.id), eq(events.organizationId, T.orgA.id)));

    await setSubscription(db, T.orgA.id, TIGHT);
    await expectLimit(await activate(), "activeEvents", 1);

    await setSubscription(db, T.orgA.id, COURTESY_PLAN_CODE, { status: "internal" });
    expect((await activate()).status).toBe(200);
    await backToDraft();

    await clearSubscription(db, T.orgA.id);
    expect((await activate()).status).toBe(200);
    await backToDraft();
  });
});

describe("convidados por evento", () => {
  const path = () => `/api/admin/events/${T.eventA.id}/invitations`;

  it("convite com mais convidados que o limite → 409; dentro do limite passa", async () => {
    await setSubscription(db, T.orgA.id, TIGHT);
    await expectLimit(await json("POST", path(), invitation(3)), "guestsPerEvent", 2);
    expect((await json("POST", path(), invitation(2))).status).toBe(201);
    await expectLimit(await json("POST", path(), invitation(1)), "guestsPerEvent", 2);
  });

  it("editar sem acrescentar passa mesmo no limite; acrescentar → 409", async () => {
    await setSubscription(db, T.orgA.id, TIGHT);
    const created = await json("POST", path(), invitation(2));
    const { invitation: inv } = (await created.json()) as {
      invitation: { id: number; guests: { id: number; name: string }[] };
    };
    const base = { ...invitation(2), label: "Família Renomeada" };
    const same = { ...base, guests: inv.guests.map((g) => ({ id: g.id, name: g.name })) };
    expect((await json("PUT", `${path()}/${inv.id}`, same)).status).toBe(200);
    const more = { ...same, maxGuests: 3, guests: [...same.guests, { name: "Mais Uma" }] };
    await expectLimit(await json("PUT", `${path()}/${inv.id}`, more), "guestsPerEvent", 2);
  });

  it("importação que passaria do limite → 409", async () => {
    await setSubscription(db, T.orgA.id, TIGHT);
    const csv =
      "convite,lado,nome\nFamília Um,Noiva,Ana\nFamília Um,Noiva,Beto\nFamília Dois,Noivo,Caio\n";
    const form = new FormData();
    form.set("file", new File([csv], "convidados.csv", { type: "text/csv" }));
    const res = await app.request(`${path()}/import`, {
      method: "POST",
      headers: { cookie: owner },
      body: form,
    });
    await expectLimit(res, "guestsPerEvent", 2);
    const [row] = await db
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.eventId, T.eventA.id));
    expect(row).toBeUndefined();
  });

  it("sem assinatura não há limite", async () => {
    expect((await json("POST", path(), invitation(5))).status).toBe(201);
  });
});

describe("equipe", () => {
  it("convite além das vagas (membros + convites em aberto) → 409", async () => {
    // Org A já tem dono e membro: 2 de 2.
    await setSubscription(db, T.orgA.id, TIGHT);
    const res = await json("POST", `/api/admin/orgs/${T.orgA.id}/invites`, {
      email: `novo-${run}@exemplo.com`,
      role: "member",
    });
    await expectLimit(res, "members", 2);
    await setSubscription(db, T.orgA.id, WIDE);
    const ok = await json("POST", `/api/admin/orgs/${T.orgA.id}/invites`, {
      email: `novo-${run}@exemplo.com`,
      role: "member",
    });
    expect(ok.status).toBe(201);
  });
});

describe("espaço em disco", () => {
  it("upload que passa do espaço do plano → 409; o uso cresce a cada upload", async () => {
    await setSubscription(db, T.orgA.id, TIGHT);
    const upload = () => {
      const form = new FormData();
      form.set("file", new File([PNG], "foto.png", { type: "image/png" }));
      return app.request(`/api/admin/events/${T.eventA.id}/uploads`, {
        method: "POST",
        headers: { cookie: owner },
        body: form,
      });
    };
    expect((await upload()).status).toBe(201);
    const [usage] = await db
      .select({ bytes: organizationUsage.storageBytes })
      .from(organizationUsage)
      .where(eq(organizationUsage.organizationId, T.orgA.id));
    expect(usage?.bytes).toBe(PNG.byteLength);

    await db
      .update(organizationUsage)
      .set({ storageBytes: MB })
      .where(eq(organizationUsage.organizationId, T.orgA.id));
    await expectLimit(await upload(), "storageMb", 1);
  });
});

describe("módulos", () => {
  it("ligar módulo fora do plano → 409; manter os já ligados passa", async () => {
    await setSubscription(db, T.orgA.id, TIGHT);
    const current = (await (
      await json("GET", `/api/admin/events/${T.eventA.id}/config`)
    ).json()) as {
      type: string;
      modules: Record<string, boolean>;
      sides: unknown;
      vocabularyOverrides: unknown;
    };
    const body = (modules: Record<string, boolean>) => ({
      type: current.type,
      modules,
      sides: current.sides,
      vocabulary: current.vocabularyOverrides,
    });
    // Mantém como está (os ligados hoje não contam, mesmo fora do plano).
    expect(
      (await json("PUT", `/api/admin/events/${T.eventA.id}/config`, body(current.modules))).status,
    ).toBe(200);
    const off = Object.fromEntries(Object.keys(current.modules).map((k) => [k, false]));
    expect((await json("PUT", `/api/admin/events/${T.eventA.id}/config`, body(off))).status).toBe(
      200,
    );
    await expectLimit(
      await json("PUT", `/api/admin/events/${T.eventA.id}/config`, body({ ...off, gallery: true })),
      "modules",
      null,
    );
    expect(
      (await json("PUT", `/api/admin/events/${T.eventA.id}/config`, body({ ...off, rsvp: true })))
        .status,
    ).toBe(200);
    // Devolve o evento como estava.
    await setSubscription(db, T.orgA.id, WIDE);
    expect(
      (await json("PUT", `/api/admin/events/${T.eventA.id}/config`, body(current.modules))).status,
    ).toBe(200);
  });
});

describe("checkPlanLimit", () => {
  it("isolamento: o limite é da organização do evento (org B sem assinatura não herda o da A)", async () => {
    await setSubscription(db, T.orgA.id, TIGHT);
    expect(await checkPlanLimit(db, T.orgB.id, { kind: "activeEvents", adding: 5 })).toEqual({
      ok: true,
    });
    expect(await checkPlanLimit(db, T.orgA.id, { kind: "activeEvents", adding: 1 })).toEqual({
      ok: false,
      kind: "activeEvents",
      limit: 1,
    });
  });
});

describe("troca para plano menor que o uso", () => {
  it("POST /subscription para um plano com limite abaixo do uso → 409 plan_limit", async () => {
    await setSubscription(db, T.orgA.id, WIDE);
    await json("POST", `/api/admin/events/${T.eventA.id}/invitations`, invitation(3));
    const res = await json("POST", `/api/admin/orgs/${T.orgA.id}/subscription`, {
      planCode: TIGHT,
      billingCycle: "monthly",
    });
    await expectLimit(res, "guestsPerEvent", 2);
  });
});
