import { eq, organizations, organizationSubscriptions } from "@casamento/db";
import {
  COURTESY_PLAN_CODE,
  type PlanAdminView,
  type PlatformOrgDetail,
  type PlatformOrgRow,
  type PlatformOverview,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents } from "./helpers.ts";
import { clearSubscription, createPlan, dropPlans, setSubscription } from "./plan-fixtures.ts";

/*
 * Fase 6, frente A: painel da plataforma (/api/admin/platform/*). Só o platform admin; os demais
 * recebem o 404 de rota. Organizações (plano, situação, uso, suspender, taxa negociada) e planos.
 */

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PLAN = `t-plat-${run}`;
const NEW_PLAN = `t-novo-${run}`;

let T: TestEvents;
const cookies: Record<string, string> = {};

const call = (who: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/admin/platform${path}`, {
    method,
    headers: { cookie: cookies[who] ?? "", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  T = await createTestEvents(db);
  for (const who of ["owner", "member", "host", "stranger", "platformAdmin"] as const) {
    cookies[who] = await T.login(app, who);
  }
  await createPlan(db, { code: PLAN, trialDays: 7, feeBps: 90 });
});

afterAll(async () => {
  await T.cleanup();
  await dropPlans(db, [PLAN, NEW_PLAN]);
  await db.$client.end();
});

describe("barreira", () => {
  it("quem não é platform admin recebe o 404 de rota; sem sessão, 401", async () => {
    for (const who of ["owner", "member", "host", "stranger"]) {
      for (const [method, path] of [
        ["GET", "/overview"],
        ["GET", "/orgs"],
        ["PATCH", `/orgs/${T.orgA.id}`],
        ["POST", "/plans"],
      ] as const) {
        const res = await call(who, method, path, method === "GET" ? undefined : {});
        expect(res.status, `${who} ${method} ${path}`).toBe(404);
        const body = (await res.json()) as { error: { message: string } };
        expect(body.error.message).toMatch(/^Rota /);
      }
    }
    expect((await call("nobody", "GET", "/overview")).status).toBe(401);
  });
});

describe("visão geral e organizações", () => {
  it("visão geral conta organizações, eventos ativos e assinaturas por situação", async () => {
    await setSubscription(db, T.orgA.id, PLAN, { status: "past_due", pastDueSince: new Date() });
    const res = await call("platformAdmin", "GET", "/overview");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PlatformOverview;
    expect(body.organizations).toBeGreaterThanOrEqual(2);
    expect(body.activeEvents).toBeGreaterThanOrEqual(2);
    expect(body.subscriptionsByStatus.past_due).toBeGreaterThanOrEqual(1);
    expect(Object.keys(body.subscriptionsByStatus).sort()).toEqual(
      ["active", "canceled", "internal", "past_due", "trialing"].sort(),
    );
    expect(typeof body.feesLast30DaysCents).toBe("number");
  });

  it("lista com busca e filtro; org sem assinatura aparece sem plano", async () => {
    await setSubscription(db, T.orgA.id, PLAN, { status: "past_due", pastDueSince: new Date() });
    const list = async (q: string) =>
      (
        (await (await call("platformAdmin", "GET", `/orgs${q}`)).json()) as {
          organizations: PlatformOrgRow[];
        }
      ).organizations;
    const byRun = await list(`?q=${T.run}`);
    const a = byRun.find((o) => o.id === T.orgA.id)!;
    const b = byRun.find((o) => o.id === T.orgB.id)!;
    expect(a).toMatchObject({ planCode: PLAN, subscriptionStatus: "past_due", status: "active" });
    expect(a.usage.activeEvents).toBe(1);
    expect(a.usage.members).toBe(2);
    expect(b).toMatchObject({ planCode: null, subscriptionStatus: null });
    const overdue = await list("?status=past_due");
    expect(overdue.some((o) => o.id === T.orgA.id)).toBe(true);
    expect(overdue.some((o) => o.id === T.orgB.id)).toBe(false);
  });

  it("detalhe: organização inexistente → 404 (não de rota)", async () => {
    const res = await call("platformAdmin", "GET", "/orgs/999999999");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      "Organização não encontrada.",
    );
  });
});

describe("PATCH /orgs/:orgId", () => {
  it("suspender e reativar; taxa negociada; plano interno e de volta a um público", async () => {
    await clearSubscription(db, T.orgA.id);
    const patch = (body: unknown) => call("platformAdmin", "PATCH", `/orgs/${T.orgA.id}`, body);

    expect((await patch({})).status).toBe(422);
    // Taxa sem assinatura → 404 do recurso.
    expect((await patch({ feeBpsOverride: 10 })).status).toBe(404);

    const suspended = (await (await patch({ status: "suspended" })).json()) as PlatformOrgDetail;
    expect(suspended.organization.status).toBe("suspended");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, T.orgA.id));
    expect(org!.status).toBe("suspended");
    await patch({ status: "active" });

    const courtesy = (await (
      await patch({ planCode: COURTESY_PLAN_CODE })
    ).json()) as PlatformOrgDetail;
    expect(courtesy.subscription).toMatchObject({ status: "internal", effectiveFeeBps: 0 });

    const back = (await (await patch({ planCode: PLAN })).json()) as PlatformOrgDetail;
    expect(back.subscription).toMatchObject({ status: "trialing", effectiveFeeBps: 90 });
    expect(back.subscription?.plan.code).toBe(PLAN);

    const fee = (await (await patch({ feeBpsOverride: 25 })).json()) as PlatformOrgDetail;
    expect(fee.subscription?.effectiveFeeBps).toBe(25);
    const reset = (await (await patch({ feeBpsOverride: null })).json()) as PlatformOrgDetail;
    expect(reset.subscription?.effectiveFeeBps).toBe(90);

    expect((await patch({ planCode: `nao-existe-${run}` })).status).toBe(422);
    // A org B não foi tocada.
    const [other] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, T.orgB.id));
    expect(other).toBeUndefined();
  });
});

describe("planos", () => {
  it("lista todos (inclusive internos), cria, recusa código repetido e edita", async () => {
    const all = (await (await call("platformAdmin", "GET", "/plans")).json()) as {
      plans: PlanAdminView[];
    };
    expect(all.plans.some((p) => p.code === COURTESY_PLAN_CODE && p.public === false)).toBe(true);

    const input = {
      code: NEW_PLAN,
      name: "Plano Novo",
      priceMonthlyCents: 1990,
      limits: { activeEvents: 3 },
    };
    const created = await call("platformAdmin", "POST", "/plans", input);
    expect(created.status).toBe(201);
    const { plan } = (await created.json()) as { plan: PlanAdminView };
    expect(plan).toMatchObject({
      code: NEW_PLAN,
      feeBps: 50,
      active: true,
      public: true,
      priceYearlyCents: null,
    });
    expect(plan.limits).toMatchObject({ activeEvents: 3, guestsPerEvent: null, modules: null });

    expect((await call("platformAdmin", "POST", "/plans", input)).status).toBe(409);
    expect((await call("platformAdmin", "POST", "/plans", { code: "Inválido!" })).status).toBe(422);

    const edited = await call("platformAdmin", "PATCH", `/plans/${NEW_PLAN}`, {
      active: false,
      feeBps: 80,
    });
    expect(edited.status).toBe(200);
    const after = ((await edited.json()) as { plan: PlanAdminView }).plan;
    // O PATCH não zera o que não veio (sem .default() no schema).
    expect(after).toMatchObject({
      active: false,
      feeBps: 80,
      name: "Plano Novo",
      priceMonthlyCents: 1990,
    });
    expect(after.limits.activeEvents).toBe(3);

    expect((await call("platformAdmin", "PATCH", `/plans/nao-existe-${run}`, {})).status).toBe(404);
  });
});
