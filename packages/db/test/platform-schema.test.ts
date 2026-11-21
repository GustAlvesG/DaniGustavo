import {
  COURTESY_PLAN_CODE as SHARED_COURTESY,
  EVENT_DOMAIN_KINDS as SHARED_DOMAIN_KINDS,
  PlanLimits,
  PRIVACY_REQUEST_KINDS as SHARED_PRIVACY_KINDS,
  PRIVACY_REQUEST_STATUSES as SHARED_PRIVACY_STATUSES,
  SUBSCRIPTION_PAYMENT_STATUSES as SHARED_PAYMENT_STATUSES,
  SUBSCRIPTION_STATUSES as SHARED_SUBSCRIPTION_STATUSES,
} from "@casamento/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { runMigrations } from "../src/migrate.ts";
import { ensureOrgSubscription, ensurePlans, PLAN_CATALOG } from "../src/plan-catalog.ts";
import { resetDatabase } from "../src/reset.ts";
import { seed } from "../src/seed.ts";
import {
  COURTESY_PLAN_CODE,
  organizationSubscriptions,
  plans,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_STATUSES,
} from "../src/schema/platform.ts";
import { PRIVACY_REQUEST_KINDS, PRIVACY_REQUEST_STATUSES } from "../src/schema/privacy.ts";
import {
  EVENT_DOMAIN_KINDS,
  eventDomains,
  LEGACY_EVENT_ID,
  organizations,
} from "../src/schema/tenancy.ts";
import { createTestDb } from "./helpers.ts";

// Fase 6 (migration 0012): plano interno "Cortesia" para as organizações que já existem,
// domínios cadastrados verificados, catálogo de planos idempotente e organização 1 com o nome
// do casamento.

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
  await resetDatabase(db);
  await runMigrations(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("listas da fase 6", () => {
  it("as do schema = as de @casamento/shared", () => {
    expect([...SUBSCRIPTION_STATUSES]).toEqual([...SHARED_SUBSCRIPTION_STATUSES]);
    expect([...SUBSCRIPTION_PAYMENT_STATUSES]).toEqual([...SHARED_PAYMENT_STATUSES]);
    expect([...PRIVACY_REQUEST_KINDS]).toEqual([...SHARED_PRIVACY_KINDS]);
    expect([...PRIVACY_REQUEST_STATUSES]).toEqual([...SHARED_PRIVACY_STATUSES]);
    expect([...EVENT_DOMAIN_KINDS]).toEqual([...SHARED_DOMAIN_KINDS]);
    expect(COURTESY_PLAN_CODE).toBe(SHARED_COURTESY);
  });

  it("os limites do catálogo passam no schema de @casamento/shared", () => {
    for (const p of PLAN_CATALOG) expect(PlanLimits.safeParse(p.limits).success, p.code).toBe(true);
  });
});

describe("migration 0012 e seed", () => {
  it("a migration já cria o plano Cortesia (sem taxa) e põe a organização 1 nele", async () => {
    const [courtesy] = await db.select().from(plans).where(eq(plans.code, COURTESY_PLAN_CODE));
    expect(courtesy).toMatchObject({ feeBps: 0, public: false });
    expect(PlanLimits.parse(courtesy!.limits)).toMatchObject({ activeEvents: null });
    const [sub] = await db
      .select({
        status: organizationSubscriptions.status,
        planId: organizationSubscriptions.planId,
      })
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, 1));
    expect(sub).toEqual({ status: "internal", planId: courtesy!.id });
  });

  it("seed: catálogo completo (idempotente), org 1 com o nome do casamento e domínios verificados", async () => {
    await seed(db, { ...process.env, ADMIN_EMAIL_1: "", ADMIN_EMAIL_2: "" });
    expect(await ensurePlans(db)).toBe(0);
    const codes = (await db.select({ code: plans.code }).from(plans)).map((p) => p.code);
    expect(codes.sort()).toEqual(PLAN_CATALOG.map((p) => p.code).sort());
    const [org] = await db.select().from(organizations).where(eq(organizations.id, 1));
    expect(org?.name).toBe("Casamento Dani & Gustavo");
    expect(await ensureOrgSubscription(db, 1, COURTESY_PLAN_CODE)).toBe(false);
    const domains = await db
      .select({ verifiedAt: eventDomains.verifiedAt })
      .from(eventDomains)
      .where(eq(eventDomains.eventId, LEGACY_EVENT_ID));
    expect(domains.length).toBeGreaterThan(0);
    expect(domains.every((d) => d.verifiedAt instanceof Date)).toBe(true);
  });

  it("organização nova sem plano interno começa em teste", async () => {
    const [res] = await db.insert(organizations).values({ slug: "f6-nova", name: "Nova" });
    expect(await ensureOrgSubscription(db, res.insertId, "essencial")).toBe(true);
    const [sub] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, res.insertId));
    expect(sub?.status).toBe("trialing");
    expect(sub?.trialEndsAt).toBeInstanceOf(Date);
  });
});
