import { eq, organizationSubscriptions, subscriptionPayments } from "@casamento/db";
import {
  COURTESY_PLAN_CODE,
  type SubscriptionChangeResult,
  type SubscriptionView,
} from "@casamento/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSubscriptionProvider, isSimulatedBilling } from "../src/billing/index.ts";
import type { MailMessage, Mailer } from "../src/mailer.ts";
import { runSubscriptionRound } from "../src/plans/subscriptions.ts";
import { createTestEvents, testApp, type TestEvents } from "./helpers.ts";
import { clearSubscription, createPlan, DAY, dropPlans, setSubscription } from "./plan-fixtures.ts";

/*
 * Fase 6, frente A: assinatura pelo provedor simulado, de ponta a ponta pela API do painel:
 * escolher plano, pagar ("Simular pagamento"), trocar, cancelar, teste e a rotina.
 */

const sent: MailMessage[] = [];
const mailer: Mailer = { send: (m) => (sent.push(m), Promise.resolve()) };
let clock = new Date();
const { app, db, env } = testApp({ mailer, now: () => clock, revalidate: () => Promise.resolve() });
const billing = createSubscriptionProvider(env);
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const BASIC = `t-bas-${run}`;
const PRO = `t-pro-${run}`;
const TRIAL = `t-tri-${run}`;
const NOPRICE = `t-sem-${run}`;

let T: TestEvents;
const cookies: Record<string, string> = {};

const call = (who: string, method: string, path: string, body?: unknown) =>
  app.request(`/api/admin/orgs/${T.orgA.id}${path}`, {
    method,
    headers: { cookie: cookies[who]!, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  T = await createTestEvents(db);
  cookies.owner = await T.login(app, "owner");
  cookies.member = await T.login(app, "member");
  await createPlan(db, { code: BASIC, priceMonthlyCents: 4990, priceYearlyCents: 49900 });
  await createPlan(db, { code: PRO, priceMonthlyCents: 9990, priceYearlyCents: null });
  await createPlan(db, { code: TRIAL, trialDays: 14 });
  await createPlan(db, { code: NOPRICE, priceMonthlyCents: null, priceYearlyCents: null });
});

beforeEach(async () => {
  clock = new Date();
  sent.length = 0;
  await clearSubscription(db, T.orgA.id);
});

afterAll(async () => {
  await T.cleanup();
  await dropPlans(db, [BASIC, PRO, TRIAL, NOPRICE]);
  await db.$client.end();
});

describe("provedor simulado", () => {
  it("é o do .env de teste (mesma instância do app)", () => {
    expect(isSimulatedBilling(billing)).toBe(true);
    expect(createSubscriptionProvider(env)).toBe(billing);
  });
});

describe("escolher, pagar, trocar e cancelar", () => {
  it("fluxo completo pela API do painel", async () => {
    // Sem assinatura (legado): GET → 404; uso responde.
    expect((await call("owner", "GET", "/subscription")).status).toBe(404);
    expect((await call("owner", "GET", "/usage")).status).toBe(200);

    const chosen = await call("owner", "POST", "/subscription", {
      planCode: BASIC,
      billingCycle: "monthly",
    });
    expect(chosen.status).toBe(200);
    const first = (await chosen.json()) as SubscriptionChangeResult;
    expect(first.subscription.plan.code).toBe(BASIC);
    expect(first.subscription.status).toBe("active");
    expect(first.invoiceUrl).toMatch(/^https:\/\/simulado\.invalid\/fatura\//);
    expect(first.subscription.payments).toHaveLength(1);
    expect(first.subscription.payments[0]).toMatchObject({ status: "pending", amountCents: 4990 });

    // Pagar: webhook pelo mesmo caminho → período pago até daqui a um mês.
    const paid = await call("owner", "POST", "/subscription/simulate", { outcome: "paid" });
    expect(paid.status).toBe(200);
    const afterPay = (await paid.json()) as SubscriptionView;
    expect(afterPay.status).toBe("active");
    expect(afterPay.currentPeriodEndsAt).not.toBeNull();
    expect(afterPay.payments.map((p) => p.status).sort()).toEqual(["paid", "pending"]);

    // Trocar de plano: a mesma assinatura no provedor, cobranças em aberto com o valor novo.
    const [before] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, T.orgA.id));
    const changed = (await (
      await call("owner", "POST", "/subscription", { planCode: PRO, billingCycle: "monthly" })
    ).json()) as SubscriptionChangeResult;
    expect(changed.subscription.plan.code).toBe(PRO);
    const [after] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, T.orgA.id));
    expect(after!.providerSubscriptionId).toBe(before!.providerSubscriptionId);
    expect(changed.subscription.payments.find((p) => p.status === "pending")?.amountCents).toBe(
      9990,
    );

    // Clicar de novo no mesmo plano: nada muda.
    const again = await call("owner", "POST", "/subscription", {
      planCode: PRO,
      billingCycle: "monthly",
    });
    expect(again.status).toBe(200);

    // Cancelar: vale até o fim do período pago; o painel não fica só leitura antes disso.
    const canceled = await call("owner", "POST", "/subscription/cancel");
    expect(canceled.status).toBe(200);
    const view = (await canceled.json()) as SubscriptionView;
    expect(view.status).toBe("canceled");
    expect(view.readOnly).toBe(false);
    expect(view.currentPeriodEndsAt).toBe(afterPay.currentPeriodEndsAt);
    expect(view.payments.find((p) => p.status === "pending")).toBeUndefined();
    // Cancelar de novo: idempotente.
    expect((await call("owner", "POST", "/subscription/cancel")).status).toBe(200);
  });

  it("plano interno, inexistente, sem preço ou ciclo sem preço → 422", async () => {
    for (const body of [
      { planCode: COURTESY_PLAN_CODE },
      { planCode: `nao-existe-${run}` },
      { planCode: NOPRICE },
      { planCode: PRO, billingCycle: "yearly" },
    ]) {
      const res = await call("owner", "POST", "/subscription", body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    expect((await call("owner", "POST", "/subscription", {})).status).toBe(422);
  });

  it("membro não escolhe nem cancela (403), mas vê a assinatura", async () => {
    await setSubscription(db, T.orgA.id, BASIC);
    expect((await call("member", "POST", "/subscription", { planCode: BASIC })).status).toBe(403);
    expect((await call("member", "POST", "/subscription/cancel")).status).toBe(403);
    expect(
      (await call("member", "POST", "/subscription/simulate", { outcome: "paid" })).status,
    ).toBe(403);
    expect((await call("member", "GET", "/subscription")).status).toBe(200);
  });

  it("plano interno não se cancela (422)", async () => {
    await setSubscription(db, T.orgA.id, COURTESY_PLAN_CODE, { status: "internal" });
    expect((await call("owner", "POST", "/subscription/cancel")).status).toBe(422);
  });
});

describe("teste grátis e rotina", () => {
  it("organização sem assinatura ganha o teste do plano; a 1ª cobrança vence no fim dele", async () => {
    const res = (await (
      await call("owner", "POST", "/subscription", { planCode: TRIAL })
    ).json()) as SubscriptionChangeResult;
    expect(res.subscription.status).toBe("trialing");
    const trialEnd = new Date(res.subscription.trialEndsAt!);
    expect(trialEnd.getTime() - clock.getTime()).toBeGreaterThan(13 * DAY);
    const due = res.subscription.payments[0]!.dueOn;
    expect(due).toBe(
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(trialEnd),
    );
  });

  it("teste vencido sem pagamento → past_due na rotina, com aviso aos donos", async () => {
    await setSubscription(db, T.orgA.id, TRIAL, {
      status: "trialing",
      trialEndsAt: new Date(clock.getTime() - DAY),
    });
    const r = await runSubscriptionRound({ env, db, billing, mailer, now: () => clock });
    expect(r.trialsEnded).toBeGreaterThanOrEqual(1);
    const [row] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, T.orgA.id));
    expect(row!.status).toBe("past_due");
    expect(row!.pastDueSince?.getTime()).toBe(clock.getTime() - DAY);
    expect(sent.some((m) => m.to === T.users.owner.email && /teste terminou/.test(m.subject))).toBe(
      true,
    );
  });

  it("rotina percebe cobrança vencida no provedor sem webhook", async () => {
    await call("owner", "POST", "/subscription", { planCode: BASIC });
    const [row] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, T.orgA.id));
    if (!isSimulatedBilling(billing)) throw new Error("esperava o simulado");
    billing.simulate(row!.providerSubscriptionId!, "overdue", clock);
    await runSubscriptionRound({ env, db, billing, mailer, now: () => clock });
    const [fresh] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, T.orgA.id));
    expect(fresh!.status).toBe("past_due");
    const pays = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.organizationId, T.orgA.id));
    expect(pays.some((p) => p.status === "overdue")).toBe(true);
    expect(sent.some((m) => /em atraso/.test(m.subject))).toBe(true);
  });
});
