import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Isolamento do painel entre eventos. As rotas saem de `app.routes` (nenhuma lista escrita à
// mão: rota nova sob /api/admin/events/:eventId entra no teste sozinha). Para cada método e
// rota: quem não tem acesso ao evento recebe o 404 de "rota não existe" (não descobre que o
// evento existe); quem tem acesso passa da barreira (a resposta pode ser 400/422 por corpo
// vazio, ou 404 "X não encontrado" do recurso, mas nunca o 404 de rota).

// Cada teste sonda todas as rotas (centenas de requisições em série, cada uma com sessão e
// consultas): com a suíte inteira em paralelo, os 5 s padrão por teste estouravam sem falha
// real. O limite maior vale só aqui; as asserções continuam as mesmas.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });

const PREFIX = "/api/admin/events/:eventId";
/** Fase 3: painel da organização. */
const ORG_PREFIX = "/api/admin/orgs/:orgId";
/** Fase 6: painel da plataforma (só platform admin). */
const PLATFORM_PREFIX = "/api/admin/platform";
/** Fase 6: dados da própria conta (LGPD). */
const ME_PREFIX = "/api/admin/me";

/**
 * Fase 6: rotas reservadas pela fundação que ainda respondem 501 (cada frente implementa as
 * suas). Sai na integração da Fase 6.
 */
const PHASE6_STUB =
  /\/(privacy|tasks\/reminders|subscription|usage|vendor-categories|platform-task-templates|domains|deletion|platform|export)(\/|$)|^\/api\/admin\/me$/;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

interface RouteCase {
  method: string;
  /** Caminho do Hono, com `:eventId` e parâmetros. */
  pattern: string;
}

/** Rotas do painel por evento: método + caminho (sem middlewares, que o Hono lista como ALL). */
function enumerateRoutes(): RouteCase[] {
  const seen = new Map<string, RouteCase>();
  for (const r of app.routes) {
    // `*` = middleware registrado com app.on(método, "*"), não é rota.
    if (!METHODS.has(r.method) || !r.path.startsWith(`${PREFIX}/`) || r.path.endsWith("*"))
      continue;
    seen.set(`${r.method} ${r.path}`, { method: r.method, pattern: r.path });
  }
  return [...seen.values()];
}

const SAMPLE: Record<string, string> = { kind: "buffet" };

/** Preenche `:eventId` e os demais parâmetros (ids numéricos inexistentes, para não tocar em dados). */
function fill(pattern: string, eventId: number): string {
  return pattern.replace(/:(\w+)(\{[^}]*\})?/g, (_m, name: string) =>
    name === "eventId" ? String(eventId) : (SAMPLE[name] ?? "999999999"),
  );
}

interface Probe {
  status: number;
  routeNotFound: boolean;
}

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const routes = enumerateRoutes();

async function probe(route: RouteCase, eventId: number, cookie: string): Promise<Probe> {
  const isWrite = route.method !== "GET";
  const res = await app.request(fill(route.pattern, eventId), {
    method: route.method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(isWrite ? { "Content-Type": "application/json" } : {}),
    },
    body: isWrite ? "{}" : undefined,
  });
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = body?.error?.message ?? "";
  return { status: res.status, routeNotFound: res.status === 404 && /^Rota /.test(message) };
}

const label = (r: RouteCase) => `${r.method} ${r.pattern.slice(PREFIX.length)}`;

/**
 * Fase 5: o anfitrião nunca escolhe a conta recebedora (`payments.configure`) e só cuida da
 * própria conta se a organização liberar (`payments.own_account`, opt-in): 403 por padrão.
 */
const HOST_FORBIDDEN = /\/payments\/(receiver|my-account)(\/|$)/;

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger", "platformAdmin"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
});

afterAll(async () => {
  await ev.cleanup();
  await db.$client.end();
});

describe("enumeração das rotas", () => {
  it("cobre todas as áreas do painel", () => {
    const areas = new Set(routes.map((r) => r.pattern.split("/")[5]));
    for (const area of [
      "dashboard",
      "invitations",
      "gifts",
      "uploads",
      "orders",
      "messages",
      "settings",
      "reminders",
      // Fase 4.
      "tasks",
      "vendor-catalog",
      "vendors",
      "quotes",
      "installments",
      "budget",
      "schedule",
      // Fase 5.
      "payments",
      // Fase 6.
      "privacy",
    ]) {
      expect(areas, `área ${area}`).toContain(area);
    }
    expect(routes.length).toBeGreaterThan(30);
  });

  it("não sobrou rota do painel fora de /events/:eventId, /orgs/:orgId, /platform e /me", () => {
    const outside = app.routes
      .filter((r) => METHODS.has(r.method) && r.path.startsWith("/api/admin/"))
      .filter(
        (r) =>
          !r.path.startsWith(`${PREFIX}/`) &&
          !r.path.startsWith(ORG_PREFIX) &&
          !r.path.startsWith(`${PLATFORM_PREFIX}/`) &&
          r.path !== ME_PREFIX &&
          !r.path.startsWith(`${ME_PREFIX}/`),
      )
      .map((r) => `${r.method} ${r.path}`);
    expect(outside).toEqual([]);
  });
});

describe("sem sessão", () => {
  it("toda rota → 401", async () => {
    for (const r of routes) {
      const p = await probe(r, ev.eventA.id, "");
      expect(p.status, label(r)).toBe(401);
    }
  });
});

describe("usuário de outro evento (stranger: dono só da org B)", () => {
  it("toda rota do evento A → 404 de rota", async () => {
    for (const r of routes) {
      const p = await probe(r, ev.eventA.id, cookies.stranger);
      expect(p, label(r)).toEqual({ status: 404, routeNotFound: true });
    }
  });

  it("no próprio evento (B) passa da barreira", async () => {
    for (const r of routes) {
      const p = await probe(r, ev.eventB.id, cookies.stranger);
      expect(p.routeNotFound, label(r)).toBe(false);
    }
  });

  it("evento inexistente ou id malformado → o mesmo 404", async () => {
    const dash = routes.find((r) => r.method === "GET" && r.pattern.endsWith("/dashboard"))!;
    for (const id of ["999999999", "0", "abc", "01", "1e3", "-1"]) {
      const res = await app.request(dash.pattern.replace(":eventId", id), {
        headers: { cookie: cookies.stranger },
      });
      expect(res.status, id).toBe(404);
    }
  });
});

describe("quem tem acesso ao evento A", () => {
  it.each(["host", "owner", "member", "platformAdmin"] as const)(
    "%s passa da barreira em toda rota",
    async (kind) => {
      for (const r of routes) {
        const p = await probe(r, ev.eventA.id, cookies[kind]);
        expect(p.routeNotFound, `${kind} ${label(r)}`).toBe(false);
        expect(p.status, `${kind} ${label(r)}`).not.toBe(401);
        if (kind === "host" && HOST_FORBIDDEN.test(r.pattern)) {
          expect(p.status, `${kind} ${label(r)}`).toBe(403);
          continue;
        }
        expect(p.status, `${kind} ${label(r)}`).not.toBe(403);
        // Nenhuma rota reservada (501), salvo as da Fase 6 ainda nas frentes.
        if (!PHASE6_STUB.test(r.pattern.slice(PREFIX.length))) {
          expect(p.status, `${kind} ${label(r)}`).not.toBe(501);
        }
      }
    },
  );

  it("host do evento A não entra no B", async () => {
    for (const r of routes) {
      const p = await probe(r, ev.eventB.id, cookies.host);
      expect(p, label(r)).toEqual({ status: 404, routeNotFound: true });
    }
  });

  it("dono e membro da org A não entram no B", async () => {
    for (const kind of ["owner", "member"] as const) {
      for (const r of routes) {
        const p = await probe(r, ev.eventB.id, cookies[kind]);
        expect(p, `${kind} ${label(r)}`).toEqual({ status: 404, routeNotFound: true });
      }
    }
  });
});

describe("platform admin", () => {
  it("entra em qualquer evento, inclusive rascunho e de outra org", async () => {
    for (const eventId of [ev.eventA.id, ev.eventB.id, ev.draftA.id]) {
      for (const r of routes) {
        const p = await probe(r, eventId, cookies.platformAdmin);
        expect(p.routeNotFound, `${eventId} ${label(r)}`).toBe(false);
      }
    }
  });

  it("/me lista todos os eventos e o papel", async () => {
    const res = await app.request("/api/admin/me", { headers: { cookie: cookies.platformAdmin } });
    const body = (await res.json()) as { events: { id: number; role: string }[] };
    const mine = body.events.filter((e) =>
      [ev.eventA.id, ev.eventB.id, ev.draftA.id].includes(e.id),
    );
    expect(mine).toHaveLength(3);
    expect(mine.every((e) => e.role === "platform_admin")).toBe(true);
  });
});

describe("dados de um evento não aparecem nem se alteram pelo outro", () => {
  const call = (id: number, path: string, kind: TestUserKind, init: RequestInit = {}) =>
    app.request(`/api/admin/events/${id}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie: cookies[kind], ...init.headers },
    });

  it("convite e presente criados em B ficam fora das listas, ids e escritas de A", async () => {
    const gift = (await (
      await call(ev.eventB.id, "/gifts", "stranger", {
        method: "POST",
        body: JSON.stringify({
          title: "Presente de B",
          category: "casa",
          priceCents: 5000,
          quotaTotal: 1,
        }),
      })
    ).json()) as { gift: { id: number } };
    const inv = (await (
      await call(ev.eventB.id, "/invitations", "stranger", {
        method: "POST",
        body: JSON.stringify({
          label: "Convite de B",
          side: "noiva",
          maxGuests: 1,
          guests: [{ name: "Fulano B" }],
        }),
      })
    ).json()) as { invitation: { id: number } };
    expect(gift.gift.id).toBeGreaterThan(0);
    expect(inv.invitation.id).toBeGreaterThan(0);

    // B enxerga os seus.
    const listB = (await (await call(ev.eventB.id, "/gifts", "stranger")).json()) as {
      gifts: { id: number }[];
    };
    expect(listB.gifts.map((g) => g.id)).toEqual([gift.gift.id]);

    // A não enxerga: listas vazias, recursos de B são 404 e escritas não pegam.
    const listA = (await (await call(ev.eventA.id, "/gifts", "host")).json()) as {
      gifts: unknown[];
    };
    expect(listA.gifts).toEqual([]);
    const invA = (await (await call(ev.eventA.id, "/invitations", "host")).json()) as {
      invitations: unknown[];
      total: number;
    };
    expect(invA).toEqual({ invitations: [], total: 0 });

    const get = await call(ev.eventA.id, `/invitations/${inv.invitation.id}`, "host");
    expect(get.status).toBe(404);
    const del = await call(ev.eventA.id, `/invitations/${inv.invitation.id}`, "host", {
      method: "DELETE",
    });
    expect(del.status).toBe(404);
    const patch = await call(ev.eventA.id, `/gifts/${gift.gift.id}/active`, "host", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    expect(patch.status).toBe(404);
    const rm = await call(ev.eventA.id, `/gifts/${gift.gift.id}`, "host", { method: "DELETE" });
    expect(rm.status).toBe(404);

    // Nada mudou em B.
    const after = (await (await call(ev.eventB.id, "/gifts", "stranger")).json()) as {
      gifts: { active: boolean }[];
    };
    expect(after.gifts[0]?.active).toBe(true);
    expect((await call(ev.eventB.id, `/invitations/${inv.invitation.id}`, "stranger")).status).toBe(
      200,
    );
  });
});

describe("Fase 4: gestão de um evento não aparece nem se altera pelo outro", () => {
  const call = (id: number, path: string, kind: TestUserKind, init: RequestInit = {}) =>
    app.request(`/api/admin/events/${id}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie: cookies[kind], ...init.headers },
    });
  const json = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;

  it("tarefa, fornecedor, orçamento e item do cronograma de B ficam fora de A", async () => {
    const B = ev.eventB.id;
    const A = ev.eventA.id;
    const task = await json<{ task: { id: number } }>(
      call(B, "/tasks", "stranger", { method: "POST", body: JSON.stringify({ title: "De B" }) }),
    );
    const vendor = await json<{ vendor: { id: number } }>(
      call(B, "/vendors", "stranger", {
        method: "POST",
        body: JSON.stringify({ vendor: { name: "Buffet de B", category: "buffet" } }),
      }),
    );
    const quote = await json<{ quote: { id: number } }>(
      call(B, "/quotes", "stranger", {
        method: "POST",
        body: JSON.stringify({
          eventVendorId: vendor.vendor.id,
          title: "Orçamento de B",
          items: [{ description: "Jantar", quantity: 1, unitCents: 1000 }],
        }),
      }),
    );
    const item = await json<{ item: { id: number } }>(
      call(B, "/schedule", "stranger", {
        method: "POST",
        body: JSON.stringify({ startTime: "18:00", title: "Jantar de B" }),
      }),
    );
    expect(task.task.id).toBeGreaterThan(0);
    expect(vendor.vendor.id).toBeGreaterThan(0);
    expect(quote.quote.id).toBeGreaterThan(0);
    expect(item.item.id).toBeGreaterThan(0);

    // Listas de A não mostram nada de B.
    expect((await json<{ tasks: unknown[] }>(call(A, "/tasks?view=all", "host"))).tasks).toEqual(
      [],
    );
    expect((await json<{ vendors: unknown[] }>(call(A, "/vendors", "host"))).vendors).toEqual([]);
    expect((await json<{ quotes: unknown[] }>(call(A, "/quotes", "host"))).quotes).toEqual([]);
    expect((await json<{ items: unknown[] }>(call(A, "/schedule", "host"))).items).toEqual([]);

    // Recursos de B pelo caminho de A: 404 (leitura e escrita).
    const patch = (body: unknown) => ({ method: "PATCH", body: JSON.stringify(body) });
    expect((await call(A, `/tasks/${task.task.id}`, "host", patch({ title: "x" }))).status).toBe(
      404,
    );
    expect((await call(A, `/vendors/${vendor.vendor.id}/contracts`, "host")).status).toBe(404);
    expect(
      (await call(A, `/vendors/${vendor.vendor.id}`, "host", { method: "DELETE" })).status,
    ).toBe(404);
    expect((await call(A, `/quotes/${quote.quote.id}`, "host")).status).toBe(404);
    expect((await call(A, `/schedule/${item.item.id}`, "host", patch({ title: "x" }))).status).toBe(
      404,
    );
    // Orçamento em A com fornecedor de B → 404/422, nunca criado.
    const cross = await call(A, "/quotes", "host", {
      method: "POST",
      body: JSON.stringify({ eventVendorId: vendor.vendor.id, title: "Cruzado", items: [] }),
    });
    expect([404, 422]).toContain(cross.status);
  });
});

/* ------------------------------------------------------------------------ */
/* Fase 3: rotas por organização (/api/admin/orgs/:orgId/*)                 */
/* ------------------------------------------------------------------------ */

/** Rotas da organização (inclui GET /orgs/:orgId), também tiradas de `app.routes`. */
function enumerateOrgRoutes(): RouteCase[] {
  const seen = new Map<string, RouteCase>();
  for (const r of app.routes) {
    if (!METHODS.has(r.method) || r.path.endsWith("*")) continue;
    if (r.path !== ORG_PREFIX && !r.path.startsWith(`${ORG_PREFIX}/`)) continue;
    seen.set(`${r.method} ${r.path}`, { method: r.method, pattern: r.path });
  }
  return [...seen.values()];
}

const orgRoutes = enumerateOrgRoutes();

/** `:orgId` e `:eventId` (um evento da própria org, para passar de requireOrgEvent). */
function fillOrg(pattern: string, orgId: number, eventId: number): string {
  return pattern.replace(/:(\w+)(\{[^}]*\})?/g, (_m, name: string) => {
    if (name === "orgId") return String(orgId);
    if (name === "eventId") return String(eventId);
    return SAMPLE[name] ?? "999999999";
  });
}

async function probeOrg(
  route: RouteCase,
  orgId: number,
  eventId: number,
  cookie: string,
): Promise<Probe> {
  return probe({ ...route, pattern: fillOrg(route.pattern, orgId, eventId) }, 0, cookie);
}

const orgLabel = (r: RouteCase) => `${r.method} ${r.pattern.slice(ORG_PREFIX.length) || "/"}`;

describe("organização: enumeração das rotas", () => {
  it("cobre as áreas da fase 3", () => {
    const paths = orgRoutes.map((r) => r.pattern.slice(ORG_PREFIX.length));
    for (const p of [
      "",
      "/dashboard",
      "/events",
      "/members",
      "/invites",
      "/events/:eventId/hosts",
      "/events/:eventId/host-permissions",
      // Fase 4.
      "/task-templates",
      "/vendors",
      // Fase 5.
      "/payment-accounts",
      "/payment-accounts/:accountId{[0-9]+}/refresh",
      // Fase 6.
      "/subscription",
      "/usage",
      "/vendor-categories",
      "/platform-task-templates",
      "/events/:eventId/domains",
      "/events/:eventId/deletion",
    ]) {
      expect(paths, p).toContain(p);
    }
  });
});

describe("organização: barreira de acesso", () => {
  it("sem sessão → 401", async () => {
    for (const r of orgRoutes) {
      const p = await probeOrg(r, ev.orgA.id, ev.eventA.id, "");
      expect(p.status, orgLabel(r)).toBe(401);
    }
  });

  it("dono da org B, anfitrião do evento A e id inexistente → 404 de rota na org A", async () => {
    for (const r of orgRoutes) {
      for (const kind of ["stranger", "host"] as const) {
        const p = await probeOrg(r, ev.orgA.id, ev.eventA.id, cookies[kind]);
        expect(p, `${kind} ${orgLabel(r)}`).toEqual({ status: 404, routeNotFound: true });
      }
      const missing = await probeOrg(r, 999999999, ev.eventA.id, cookies.platformAdmin);
      expect(missing, `inexistente ${orgLabel(r)}`).toEqual({ status: 404, routeNotFound: true });
    }
  });

  it("dono, membro e platform admin passam da barreira (membro pode levar 403)", async () => {
    for (const r of orgRoutes) {
      for (const kind of ["owner", "member", "platformAdmin"] as const) {
        const p = await probeOrg(r, ev.orgA.id, ev.eventA.id, cookies[kind]);
        expect(p.routeNotFound, `${kind} ${orgLabel(r)}`).toBe(false);
        expect(p.status, `${kind} ${orgLabel(r)}`).not.toBe(401);
        if (kind !== "member") expect(p.status, `${kind} ${orgLabel(r)}`).not.toBe(403);
        if (!PHASE6_STUB.test(r.pattern.slice(ORG_PREFIX.length))) {
          expect(p.status, `${kind} ${orgLabel(r)}`).not.toBe(501);
        }
      }
    }
  });

  it("Fase 5: membro não cadastra a conta da organização (403)", async () => {
    const res = await app.request(`/api/admin/orgs/${ev.orgA.id}/payment-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookies.member },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("Fase 6: membro não mexe na assinatura nem apaga evento (403)", async () => {
    const post = (path: string) =>
      app.request(`/api/admin/orgs/${ev.orgA.id}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookies.member },
        body: "{}",
      });
    expect((await post("/subscription")).status).toBe(403);
    expect((await post("/subscription/cancel")).status).toBe(403);
    expect((await post(`/events/${ev.eventA.id}/deletion`)).status).toBe(403);
  });

  it("membro não mexe na equipe (403)", async () => {
    const res = await app.request(`/api/admin/orgs/${ev.orgA.id}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookies.member },
      body: JSON.stringify({ email: "x@exemplo.com" }),
    });
    expect(res.status).toBe(403);
  });

  it("evento de outra org pelo caminho da org A → 404 de rota", async () => {
    for (const r of orgRoutes.filter((x) => x.pattern.includes(":eventId/"))) {
      const p = await probeOrg(r, ev.orgA.id, ev.eventB.id, cookies.owner);
      expect(p, orgLabel(r)).toEqual({ status: 404, routeNotFound: true });
    }
  });

  it("/me lista as organizações com o papel", async () => {
    const me = async (kind: TestUserKind) =>
      (await (
        await app.request("/api/admin/me", { headers: { cookie: cookies[kind] } })
      ).json()) as {
        organizations: { id: number; role: string }[];
      };
    expect((await me("owner")).organizations).toEqual([
      expect.objectContaining({ id: ev.orgA.id, role: "org_owner" }),
    ]);
    expect((await me("member")).organizations).toEqual([
      expect.objectContaining({ id: ev.orgA.id, role: "org_member" }),
    ]);
    expect((await me("host")).organizations).toEqual([]);
    const admin = (await me("platformAdmin")).organizations.filter((o) =>
      [ev.orgA.id, ev.orgB.id].includes(o.id),
    );
    expect(admin.map((o) => o.role)).toEqual(["platform_admin", "platform_admin"]);
  });
});

/* ------------------------------------------------------------------------ */
/* Fase 6: painel da plataforma (/api/admin/platform/*) e /me/*              */
/* ------------------------------------------------------------------------ */

function enumeratePrefixed(prefix: string): RouteCase[] {
  const seen = new Map<string, RouteCase>();
  for (const r of app.routes) {
    if (!METHODS.has(r.method) || r.path.endsWith("*")) continue;
    if (r.path !== prefix && !r.path.startsWith(`${prefix}/`)) continue;
    seen.set(`${r.method} ${r.path}`, { method: r.method, pattern: r.path });
  }
  return [...seen.values()];
}

const platformRoutes = enumeratePrefixed(PLATFORM_PREFIX);
/** Sem o GET /me (lista de eventos, já coberto acima). */
const meRoutes = enumeratePrefixed(ME_PREFIX).filter(
  (r) => r.pattern !== ME_PREFIX || r.method !== "GET",
);
const fillAny = (pattern: string) =>
  pattern.replace(/:(\w+)(\{[^}]*\})?/g, (_m, name: string) => SAMPLE[name] ?? "999999999");
const platformLabel = (r: RouteCase) => `${r.method} ${r.pattern}`;

describe("Fase 6: painel da plataforma", () => {
  it("cobre as áreas", () => {
    const paths = platformRoutes.map((r) => r.pattern.slice(PLATFORM_PREFIX.length));
    for (const p of ["/overview", "/orgs", "/plans", "/task-templates"]) {
      expect(paths, p).toContain(p);
    }
  });

  it("sem sessão → 401", async () => {
    for (const r of platformRoutes) {
      const p = await probe({ ...r, pattern: fillAny(r.pattern) }, 0, "");
      expect(p.status, platformLabel(r)).toBe(401);
    }
  });

  it("dono, membro, anfitrião e dono de outra org → 404 de rota (não descobrem o painel)", async () => {
    for (const r of platformRoutes) {
      for (const kind of ["owner", "member", "host", "stranger"] as const) {
        const p = await probe({ ...r, pattern: fillAny(r.pattern) }, 0, cookies[kind]);
        expect(p, `${kind} ${platformLabel(r)}`).toEqual({ status: 404, routeNotFound: true });
      }
    }
  });

  it("platform admin passa da barreira", async () => {
    for (const r of platformRoutes) {
      const p = await probe({ ...r, pattern: fillAny(r.pattern) }, 0, cookies.platformAdmin);
      expect(p.routeNotFound, platformLabel(r)).toBe(false);
      expect([401, 403], platformLabel(r)).not.toContain(p.status);
    }
  });
});

describe("Fase 6: /me (dados da própria conta)", () => {
  it("sem sessão → 401; com sessão passa", async () => {
    expect(meRoutes.length).toBeGreaterThan(0);
    for (const r of meRoutes) {
      expect((await probe(r, 0, "")).status, platformLabel(r)).toBe(401);
      // DELETE /me apagaria a conta de teste: só a barreira sem sessão aqui.
      if (r.method === "DELETE") continue;
      const p = await probe(r, 0, cookies.host);
      expect(p.routeNotFound, platformLabel(r)).toBe(false);
      expect(p.status, platformLabel(r)).not.toBe(401);
    }
  });
});
