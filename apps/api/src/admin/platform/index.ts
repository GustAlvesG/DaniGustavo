import {
  and,
  asc,
  count,
  eq,
  events,
  giftOrders,
  gt,
  isNotNull,
  organizations,
  organizationSubscriptions,
  plans,
  sql,
  type Database,
} from "@casamento/db";
import {
  PlanInput,
  PlanUpdate,
  PlatformOrgUpdate,
  SUBSCRIPTION_STATUSES,
  type PlatformOrgRow,
  type PlatformOverview,
  type SubscriptionStatus,
} from "@casamento/shared";
import { Hono, type Context } from "hono";
import { apiError, ERROR_CODES, errorBody } from "../../errors.ts";
import {
  computeUsage,
  findPlan,
  loadSubscription,
  planView,
  subscriptionView,
} from "../../plans/service.ts";
import {
  assignPlanAsAdmin,
  setFeeOverride,
  type SubscriptionDeps,
} from "../../plans/subscriptions.ts";
import { subscriptionErrors } from "../org/subscription.ts";
import { crossEvent } from "../../tenancy/cross-event.ts";
import { requirePlatformAdmin, requirePlatformPermission } from "../../tenancy/platform-access.ts";
import { invalid, readJson, type AdminDeps, type AdminEnv } from "../context.ts";

/*
 * Fase 6, frente A (docs/saas/fase-6.md): painel do platform admin, em /api/admin/platform.
 * Quem não é platform admin recebe o 404 de rota. Leituras entre organizações dentro de
 * crossEvent("painel da plataforma", fn).
 *
 * - GET   /overview          → PlatformOverview                   (platform.read)
 * - GET   /orgs              ?q=&status= → { organizations: PlatformOrgRow[] } (platform.read;
 *   `status` = situação da org (active/suspended) ou da assinatura (trialing, past_due…))
 * - GET   /orgs/:orgId       → { organization: PlatformOrgRow, subscription: SubscriptionView | null }
 * - PATCH /orgs/:orgId       PlatformOrgUpdate → idem              (platform.orgs.manage; plano
 *   interno só aqui; suspender a org deixa o painel dela só leitura, nunca o site dos convidados)
 * - GET   /plans             → { plans: PlanView[] } (todos, inclusive internos e inativos, com
 *   `active` e `sort`)
 * - POST  /plans             PlanInput → { plan }                  (platform.plans.manage)
 * - PATCH /plans/:code       PlanUpdate → { plan }                 (platform.plans.manage)
 * Os modelos de tarefas da plataforma (frente E) ficam em ./task-templates.ts.
 */

const ORG_LIST_LIMIT = 500;
const DAY = 86_400_000;
const ID = /^[1-9]\d{0,15}$/;

type OrgBase = {
  id: number;
  slug: string;
  name: string;
  status: "active" | "suspended";
  createdAt: Date;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: SubscriptionStatus | null;
};

async function orgRows(db: Database, orgId?: number): Promise<OrgBase[]> {
  return crossEvent(
    "painel da plataforma: organizações",
    async () =>
      await db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          status: organizations.status,
          createdAt: organizations.createdAt,
          planCode: plans.code,
          planName: plans.name,
          subscriptionStatus: organizationSubscriptions.status,
        })
        .from(organizations)
        .leftJoin(
          organizationSubscriptions,
          eq(organizationSubscriptions.organizationId, organizations.id),
        )
        .leftJoin(plans, eq(plans.id, organizationSubscriptions.planId))
        .where(orgId ? eq(organizations.id, orgId) : undefined)
        .orderBy(asc(organizations.id))
        .limit(ORG_LIST_LIMIT),
  );
}

async function toRow(db: Database, o: OrgBase): Promise<PlatformOrgRow> {
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    status: o.status,
    planCode: o.planCode,
    planName: o.planName,
    subscriptionStatus: o.subscriptionStatus,
    usage: await computeUsage(db, o.id),
    createdAt: o.createdAt.toISOString(),
  };
}

/** Plano completo para o platform admin (o PlanView mais `active`, `sort` e preços). */
function adminPlan(row: typeof plans.$inferSelect) {
  return { ...planView(row), active: row.active, sort: row.sort };
}

export function platformRoutes(deps: AdminDeps) {
  const { db } = deps;
  const sdeps: SubscriptionDeps = {
    env: deps.env,
    db,
    billing: deps.billing,
    mailer: deps.mailer,
    now: deps.now,
  };
  const app = new Hono<AdminEnv>();
  app.use("*", requirePlatformAdmin());
  const org = "/orgs/:orgId{[0-9]+}";

  app.get("/overview", requirePlatformPermission("platform.read"), async (c) => {
    const since = new Date(deps.now().getTime() - 30 * DAY);
    const [[orgCount], [activeEvents], byStatus, [fees]] = await crossEvent(
      "painel da plataforma: visão geral",
      async () =>
        await Promise.all([
          db.select({ n: count() }).from(organizations),
          db.select({ n: count() }).from(events).where(eq(events.status, "active")),
          db
            .select({ status: organizationSubscriptions.status, n: count() })
            .from(organizationSubscriptions)
            .groupBy(organizationSubscriptions.status),
          db
            .select({ total: sql<string | null>`sum(${giftOrders.platformFeeCents})` })
            .from(giftOrders)
            .where(
              and(
                eq(giftOrders.status, "paid"),
                isNotNull(giftOrders.platformFeeCents),
                gt(giftOrders.paidAt, since),
              ),
            ),
        ]),
    );
    const subscriptionsByStatus = Object.fromEntries(
      SUBSCRIPTION_STATUSES.map((s) => [s, 0]),
    ) as Record<SubscriptionStatus, number>;
    for (const r of byStatus) subscriptionsByStatus[r.status] = Number(r.n);
    const body: PlatformOverview = {
      organizations: Number(orgCount?.n ?? 0),
      activeEvents: Number(activeEvents?.n ?? 0),
      subscriptionsByStatus,
      feesLast30DaysCents: Number(fees?.total ?? 0),
    };
    return c.json(body);
  });

  app.get("/orgs", requirePlatformPermission("platform.read"), async (c) => {
    const q = (c.req.query("q") ?? "").trim().toLowerCase();
    const status = c.req.query("status") ?? "";
    const rows = (await orgRows(db)).filter((o) => {
      if (q && !o.name.toLowerCase().includes(q) && !o.slug.includes(q)) return false;
      if (!status) return true;
      return o.status === status || o.subscriptionStatus === status;
    });
    return c.json({ organizations: await Promise.all(rows.map((o) => toRow(db, o))) });
  });

  async function orgDetail(c: Context, orgId: number) {
    const [o] = await orgRows(db, orgId);
    if (!o) return apiError(c, 404, ERROR_CODES.notFound, "Organização não encontrada.");
    const current = await loadSubscription(db, orgId);
    return c.json({
      organization: await toRow(db, o),
      subscription: current ? await subscriptionView(db, current, deps.now()) : null,
    });
  }

  app.get(org, requirePlatformPermission("platform.read"), (c) =>
    orgDetail(c, Number(c.req.param("orgId"))),
  );

  app.patch(org, requirePlatformPermission("platform.orgs.manage"), async (c) => {
    const raw = c.req.param("orgId");
    const orgId = ID.test(raw) ? Number(raw) : 0;
    const parsed = PlatformOrgUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const [exists] = await orgRows(db, orgId);
    if (!exists) return apiError(c, 404, ERROR_CODES.notFound, "Organização não encontrada.");
    const input = parsed.data;
    const now = deps.now();
    return subscriptionErrors(c, async () => {
      if (input.planCode !== undefined) {
        const plan = await findPlan(db, input.planCode);
        if (!plan) {
          return c.json(
            errorBody(ERROR_CODES.invalidRequest, "Plano não encontrado.", "planCode"),
            422,
          );
        }
        await assignPlanAsAdmin(sdeps, orgId, plan);
      }
      if (input.feeBpsOverride !== undefined) {
        await setFeeOverride(db, orgId, input.feeBpsOverride, now);
      }
      if (input.status !== undefined) {
        await db
          .update(organizations)
          .set({ status: input.status, updatedAt: now })
          .where(eq(organizations.id, orgId));
      }
      return orgDetail(c, orgId);
    });
  });

  app.get("/plans", requirePlatformPermission("platform.read"), async (c) => {
    const rows = await db.select().from(plans).orderBy(asc(plans.sort), asc(plans.id));
    return c.json({ plans: rows.map(adminPlan) });
  });

  app.post("/plans", requirePlatformPermission("platform.plans.manage"), async (c) => {
    const parsed = PlanInput.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    if (await findPlan(db, parsed.data.code)) {
      return c.json(
        errorBody(ERROR_CODES.conflict, "Já existe um plano com esse código.", "code"),
        409,
      );
    }
    await db.insert(plans).values(parsed.data);
    return c.json({ plan: adminPlan((await findPlan(db, parsed.data.code))!) }, 201);
  });

  app.patch("/plans/:code", requirePlatformPermission("platform.plans.manage"), async (c) => {
    const code = c.req.param("code");
    const parsed = PlanUpdate.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const current = await findPlan(db, code);
    if (!current) return apiError(c, 404, ERROR_CODES.notFound, "Plano não encontrado.");
    if (Object.keys(parsed.data).length > 0) {
      await db
        .update(plans)
        .set({ ...parsed.data, updatedAt: deps.now() })
        .where(eq(plans.id, current.id));
    }
    return c.json({ plan: adminPlan((await findPlan(db, code))!) });
  });

  return app;
}
