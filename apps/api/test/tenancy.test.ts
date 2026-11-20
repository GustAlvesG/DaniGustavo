import { eq, eventDomains, eventMembers, events } from "@casamento/db";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireSession } from "../src/admin/context.ts";
import { createAuth } from "../src/auth.ts";
import { errorBody, routeNotFound } from "../src/errors.ts";
import { requireEventAccess } from "../src/tenancy/access.ts";
import { crossEvent, crossEventReason, isCrossEvent } from "../src/tenancy/cross-event.ts";
import { ACTIONS, can, requirePermission } from "../src/tenancy/permissions.ts";
import { publicEvent } from "../src/tenancy/public.ts";
import { createEventResolver } from "../src/tenancy/resolver.ts";
import {
  EVENT_ACCESS_ROLES,
  type EventAccessRole,
  type EventAdminEnv,
  type PublicEventEnv,
} from "../src/tenancy/types.ts";
import { eventBaseUrl } from "../src/tenancy/urls.ts";
import { analyzeSql, originOf } from "./sql-audit.ts";
import {
  createTestEvents,
  testApp,
  testEnv,
  TEST_USER_KINDS,
  type TestEvents,
  type TestUserKind,
} from "./helpers.ts";

const { app, db, env } = testApp();
let fx: TestEvents;
const cookies = {} as Record<TestUserKind, string>;

beforeAll(async () => {
  fx = await createTestEvents(db);
  for (const kind of TEST_USER_KINDS) cookies[kind] = await fx.login(app, kind);
});

afterAll(async () => {
  await fx?.cleanup();
  await db.$client.end();
});

const notFoundBody = (method: string, path: string) =>
  errorBody("not_found", `Rota ${method} ${path} não existe.`);

type Which = "A" | "B" | "draftA";
const pick = (which: Which) => (which === "A" ? fx.eventA : which === "B" ? fx.eventB : fx.draftA);

describe("resolver de eventos", () => {
  it("acha por slug, id e host (host sem diferença de maiúsculas)", async () => {
    const r = createEventResolver(db);
    expect(await r.bySlug(fx.eventA.slug)).toEqual(fx.eventA);
    expect(await r.byId(fx.eventB.id)).toEqual(fx.eventB);
    expect(await r.byHost(fx.secondaryHostA.toUpperCase())).toEqual(fx.eventA);
    expect(await r.primaryHost(fx.eventA.id)).toBe(fx.primaryHostA);
    expect(await r.primaryHost(fx.eventB.id)).toBeNull();
    expect(await r.bySlug(`nao-existe-${fx.run}`)).toBeNull();
    expect(await r.byId(999_999_999)).toBeNull();
    expect(await r.byHost("ninguem.teste.local")).toBeNull();
  });

  it("guarda em cache por 60 s e invalida por evento", async () => {
    let now = 1_000_000;
    const r = createEventResolver(db, { now: () => now });
    expect((await r.bySlug(fx.eventB.slug))?.name).toBe(fx.eventB.name);
    await db.update(events).set({ name: "Renomeado" }).where(eq(events.id, fx.eventB.id));
    try {
      expect((await r.bySlug(fx.eventB.slug))?.name).toBe(fx.eventB.name);
      now += 59_000;
      expect((await r.bySlug(fx.eventB.slug))?.name).toBe(fx.eventB.name);
      now += 2_000;
      expect((await r.bySlug(fx.eventB.slug))?.name).toBe("Renomeado");
      expect((await r.byId(fx.eventB.id))?.name).toBe("Renomeado");

      await db.update(events).set({ name: "De novo" }).where(eq(events.id, fx.eventB.id));
      expect((await r.byId(fx.eventB.id))?.name).toBe("Renomeado");
      r.invalidate(fx.eventA.id);
      expect((await r.byId(fx.eventB.id))?.name).toBe("Renomeado");
      r.invalidate(fx.eventB.id);
      expect((await r.byId(fx.eventB.id))?.name).toBe("De novo");
    } finally {
      await db.update(events).set({ name: fx.eventB.name }).where(eq(events.id, fx.eventB.id));
    }
  });

  it("descarta o mais antigo quando passa do limite", async () => {
    const r = createEventResolver(db, { maxEntries: 1 });
    await r.bySlug(fx.eventA.slug);
    await db.update(events).set({ name: "Mudou" }).where(eq(events.id, fx.eventA.id));
    try {
      await r.bySlug(fx.eventB.slug); // empurra o A para fora
      expect((await r.bySlug(fx.eventA.slug))?.name).toBe("Mudou");
    } finally {
      await db.update(events).set({ name: fx.eventA.name }).where(eq(events.id, fx.eventA.id));
    }
  });
});

describe("publicEvent", () => {
  const mini = () => {
    const a = new Hono<PublicEventEnv>();
    a.use("/api/e/:slug/*", publicEvent(createEventResolver(db)));
    a.get("/api/e/:slug/ping", (c) => c.json(c.get("event")));
    return a;
  };

  it("põe o evento ativo no contexto", async () => {
    const res = await mini().request(`/api/e/${fx.eventA.slug}/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...fx.eventA, startsAt: fx.eventA.startsAt?.toISOString() });
  });

  it.each(["inexistente", "rascunho"])(
    "evento %s → 404 igual ao de rota inexistente",
    async (k) => {
      const slug = k === "rascunho" ? fx.draftA.slug : `nao-existe-${fx.run}`;
      const path = `/api/e/${slug}/ping`;
      const res = await mini().request(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody("GET", path));
    },
  );
});

describe("requireEventAccess", () => {
  const auth = createAuth(env, db);
  const mini = () => {
    const a = new Hono<EventAdminEnv>();
    a.use("/api/admin/*", requireSession(auth));
    a.use("/api/admin/events/:eventId/*", requireEventAccess(db, createEventResolver(db)));
    a.get("/api/admin/events/:eventId/papel", (c) =>
      c.json({ role: c.get("eventRole"), event: c.get("event").id }),
    );
    a.post("/api/admin/events/:eventId/reembolso", requirePermission("orders.refund"), (c) =>
      c.json({ ok: true }),
    );
    a.notFound(routeNotFound);
    return a;
  };
  const get = (kind: TestUserKind, eventId: number | string) =>
    mini().request(`/api/admin/events/${eventId}/papel`, { headers: { cookie: cookies[kind] } });

  it.each<[TestUserKind, Which, EventAccessRole]>([
    ["host", "A", "event_host"],
    ["owner", "A", "org_owner"],
    ["owner", "draftA", "org_owner"],
    ["member", "A", "org_member"],
    ["member", "draftA", "org_member"],
    ["stranger", "B", "org_owner"],
    ["platformAdmin", "A", "platform_admin"],
    ["platformAdmin", "B", "platform_admin"],
  ])("%s no evento %s → %s", async (kind, which, role) => {
    const ev = pick(which);
    const res = await get(kind, ev.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role, event: ev.id });
  });

  it.each<[TestUserKind, Which]>([
    ["stranger", "A"],
    ["host", "B"],
    ["host", "draftA"],
    ["owner", "B"],
    ["member", "B"],
  ])("%s no evento %s → 404 com o corpo de rota inexistente", async (kind, which) => {
    const ev = pick(which);
    const res = await get(kind, ev.id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(notFoundBody("GET", `/api/admin/events/${ev.id}/papel`));
  });

  it.each(["abc", "0", "01", "-1", "1.5", "99999999999999999999", "999999999"])(
    "eventId %s → 404",
    async (id) => {
      const res = await get("platformAdmin", id);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody("GET", `/api/admin/events/${id}/papel`));
    },
  );

  it("sem sessão → 401", async () => {
    const res = await mini().request(`/api/admin/events/${fx.eventA.id}/papel`);
    expect(res.status).toBe(401);
  });

  it("requirePermission deixa passar quem pode", async () => {
    const res = await mini().request(`/api/admin/events/${fx.eventA.id}/reembolso`, {
      method: "POST",
      headers: { cookie: cookies.member },
    });
    expect(res.status).toBe(200);
  });
});

describe("permissões", () => {
  it("na Fase 1 todo papel pode toda ação", () => {
    for (const role of EVENT_ACCESS_ROLES) {
      for (const action of ACTIONS) expect(can(role, action)).toBe(true);
    }
  });

  it("requirePermission responde 403 quando o papel não pode", async () => {
    const a = new Hono<EventAdminEnv>();
    a.use("*", async (c, next) => {
      c.set("eventRole", "visitante" as EventAccessRole);
      await next();
    });
    a.post("/x", requirePermission("settings.write"), (c) => c.json({ ok: true }));
    const res = await a.request("/x", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });
});

describe("crossEvent", () => {
  it("marca só o que roda dentro, inclusive depois de await", async () => {
    expect(isCrossEvent()).toBe(false);
    const seen = await crossEvent("rotina de expiração", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return [isCrossEvent(), crossEventReason()];
    });
    expect(seen).toEqual([true, "rotina de expiração"]);
    expect(isCrossEvent()).toBe(false);
    expect(crossEventReason()).toBeNull();
  });

  it("exige motivo", () => {
    expect(() => crossEvent("  ", () => 1)).toThrow(/motivo/);
  });
});

describe("eventBaseUrl", () => {
  const resolver = createEventResolver(db);

  it("usa o host primário (http fora de produção, https em produção)", async () => {
    expect(await eventBaseUrl(fx.eventA, { env, resolver })).toBe(`http://${fx.primaryHostA}`);
    const prod = { ...env, NODE_ENV: "production" as const };
    expect(await eventBaseUrl(fx.eventA, { env: prod, resolver })).toBe(
      `https://${fx.primaryHostA}`,
    );
  });

  it("sem domínio cai no SITE_URL", async () => {
    const e = testEnv({ SITE_URL: "https://site.exemplo.com/" });
    expect(await eventBaseUrl(fx.eventB, { env: e, resolver })).toBe("https://site.exemplo.com");
  });
});

describe("GET /api/hosts/:host", () => {
  it("devolve o evento pelo host, sem X-Web-Key", async () => {
    const res = await app.request(`/api/hosts/${encodeURIComponent(fx.secondaryHostA)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: fx.eventA.id,
      slug: fx.eventA.slug,
      name: fx.eventA.name,
      type: "wedding",
      timezone: "America/Sao_Paulo",
      startsAt: "2030-01-01T15:00:00.000Z",
      primaryHost: fx.primaryHostA,
    });
  });

  it("aceita maiúsculas e porta", async () => {
    const host = encodeURIComponent(fx.primaryHostA.toUpperCase());
    const res = await app.request(`/api/hosts/${host}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: fx.eventA.id, primaryHost: fx.primaryHostA });
  });

  it("host desconhecido ou de evento em rascunho → 404", async () => {
    const draftHost = `rascunho-${fx.run}.teste.local`;
    await db.insert(eventDomains).values({ eventId: fx.draftA.id, host: draftHost });
    for (const host of [`nada-${fx.run}.teste.local`, draftHost]) {
      const res = await app.request(`/api/hosts/${host}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFoundBody("GET", `/api/hosts/${host}`));
    }
  });
});

describe("GET /api/hosts", () => {
  it("lista só o host primário de cada evento ativo", async () => {
    const draftHost = `rascunho-primario-${fx.run}.teste.local`;
    await db
      .insert(eventDomains)
      .values({ eventId: fx.draftA.id, host: draftHost, isPrimary: true });
    const res = await app.request("/api/hosts");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const { hosts } = (await res.json()) as { hosts: string[] };
    expect(hosts).toContain(fx.primaryHostA);
    expect(hosts).not.toContain(fx.secondaryHostA);
    expect(hosts).not.toContain(draftHost);
  });
});

describe("GET /api/admin/me", () => {
  interface Me {
    user: { id: string; email: string; platformRole: string | null };
    events: { id: number; slug: string; role: EventAccessRole; orgName: string }[];
  }
  const me = async (kind: TestUserKind) => {
    const res = await app.request("/api/admin/me", { headers: { cookie: cookies[kind] } });
    expect(res.status).toBe(200);
    return (await res.json()) as Me;
  };
  const roles = (body: Me) => body.events.map((e) => [e.slug, e.role]);
  const fixtureOnly = (body: Me) =>
    body.events
      .filter((e) => [fx.eventA.id, fx.eventB.id, fx.draftA.id].includes(e.id))
      .map((e) => [e.slug, e.role]);

  it("sem sessão → 401", async () => {
    expect((await app.request("/api/admin/me")).status).toBe(401);
  });

  it("host vê só o evento dele", async () => {
    const body = await me("host");
    expect(body.user).toMatchObject({ id: fx.users.host.id, platformRole: null });
    expect(roles(body)).toEqual([[fx.eventA.slug, "event_host"]]);
  });

  it("owner e member veem os eventos da org", async () => {
    expect(roles(await me("owner"))).toEqual([
      [fx.eventA.slug, "org_owner"],
      [fx.draftA.slug, "org_owner"],
    ]);
    expect(roles(await me("member"))).toEqual([
      [fx.eventA.slug, "org_member"],
      [fx.draftA.slug, "org_member"],
    ]);
  });

  it("estranho (owner da org B) não vê a org A", async () => {
    const body = await me("stranger");
    expect(roles(body)).toEqual([[fx.eventB.slug, "org_owner"]]);
    expect(body.events[0]?.orgName).toBe(`Org b ${fx.run}`);
  });

  it("platform admin vê todos os eventos", async () => {
    const body = await me("platformAdmin");
    expect(body.user.platformRole).toBe("admin");
    expect(fixtureOnly(body)).toEqual([
      [fx.eventA.slug, "platform_admin"],
      [fx.eventB.slug, "platform_admin"],
      [fx.draftA.slug, "platform_admin"],
    ]);
  });

  it("com dois vínculos, vale o papel mais forte", async () => {
    await db
      .insert(eventMembers)
      .values({ eventId: fx.eventA.id, userId: fx.users.member.id, role: "host" });
    try {
      expect(roles(await me("member"))[0]).toEqual([fx.eventA.slug, "org_member"]);
    } finally {
      await db.delete(eventMembers).where(eq(eventMembers.userId, fx.users.member.id));
    }
  });
});

describe("auditor de SQL", () => {
  it("só acusa consulta em tabela com escopo sem event_id depois do FROM", () => {
    expect(analyzeSql("select `id`, `event_id` from `gifts` where `gifts`.`id` = ?")).toEqual({
      kind: "select",
      tables: ["gifts"],
      scoped: false,
    });
    expect(
      analyzeSql("select `id` from `gifts` where (`gifts`.`event_id` = ? and `gifts`.`id` = ?)"),
    ).toMatchObject({ scoped: true });
    expect(analyzeSql("update `gifts` set `event_id` = ? where `gifts`.`id` = ?")).toMatchObject({
      kind: "update",
      scoped: false,
    });
    expect(
      analyzeSql("delete from `messages` where `messages`.`event_id` in (?, ?)"),
    ).toMatchObject({ kind: "delete", scoped: true });
    expect(analyzeSql("select `id` from `events` where `events`.`slug` = ?")).toBeNull();
    expect(analyzeSql("insert into `gifts` (`id`) values (?)")).toBeNull();
    // webhook_events.event_id é o id do provedor; a tabela não entra no escopo.
    expect(
      analyzeSql("select `id` from `webhook_events` where `webhook_events`.`event_id` = ?"),
    ).toBeNull();
  });

  it("tabela por organização (Fase 3) exige organization_id; com evento junto, as duas colunas", () => {
    expect(
      analyzeSql("select `id` from `team_invites` where `team_invites`.`token_hash` = ?"),
    ).toMatchObject({ tables: ["team_invites"], scoped: false });
    expect(
      analyzeSql(
        "select `id` from `team_invites` where (`team_invites`.`organization_id` = ? and `team_invites`.`email` = ?)",
      ),
    ).toMatchObject({ scoped: true });
    // event_id não substitui organization_id em team_invites.
    expect(
      analyzeSql("select `id` from `team_invites` where `team_invites`.`event_id` = ?"),
    ).toMatchObject({ scoped: false });
    expect(
      analyzeSql(
        "select `id` from `team_invites` inner join `invitations` on `invitations`.`event_id` = ? where `team_invites`.`organization_id` = ?",
      ),
    ).toMatchObject({ tables: ["team_invites", "invitations"], scoped: true });
  });

  it("acha o módulo de origem na pilha", () => {
    const stack = [
      "Error",
      "    at x (file:///C:/dev/casamento/packages/db/src/testing/query-origin.ts:30:5)",
      "    at listGifts (file:///C:/dev/casamento/apps/api/src/admin/gifts.ts:56:10)",
    ].join("\n");
    expect(originOf(stack)).toBe("src/admin/gifts.ts:56");
    expect(originOf("Error\n    at t (C:\\dev\\casamento\\apps\\api\\test\\a.test.ts:1:1)")).toBe(
      null,
    );
  });
});
