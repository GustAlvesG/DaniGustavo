import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Isolamento do painel entre eventos. As rotas saem de `app.routes` (nenhuma lista escrita à
// mão: rota nova sob /api/admin/events/:eventId entra no teste sozinha). Para cada método e
// rota: quem não tem acesso ao evento recebe o 404 de "rota não existe" (não descobre que o
// evento existe); quem tem acesso passa da barreira (a resposta pode ser 400/422 por corpo
// vazio, ou 404 "X não encontrado" do recurso, mas nunca o 404 de rota).

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });

const PREFIX = "/api/admin/events/:eventId";
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
    ]) {
      expect(areas, `área ${area}`).toContain(area);
    }
    expect(routes.length).toBeGreaterThan(30);
  });

  it("não sobrou rota do painel fora de /events/:eventId (exceto /me)", () => {
    const outside = app.routes
      .filter((r) => METHODS.has(r.method) && r.path.startsWith("/api/admin/"))
      .filter((r) => !r.path.startsWith(`${PREFIX}/`) && r.path !== "/api/admin/me")
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
        expect(p.status, `${kind} ${label(r)}`).not.toBe(403);
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
