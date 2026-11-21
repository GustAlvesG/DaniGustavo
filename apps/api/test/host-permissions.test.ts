import {
  EVENT_ACTIONS,
  HOST_CONFIGURABLE_ACTIONS,
  HOST_NEVER_ACTIONS,
  HOST_OPT_IN_ACTIONS,
  withDependents,
  type EventAction,
  type EventAccessView,
  type HostPermissionsView,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 3, frente C: permissões do anfitrião por evento (`event.host_permissions`, lista de
// negação). As rotas saem de `app.routes`: rota nova sem requirePermission quebra o teste.

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });

const PREFIX = "/api/admin/events/:eventId";
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
/** Rotas de `dashboard.read` (o anfitrião sempre pode: sem elas nem entra no evento). */
const ALWAYS = ["GET /dashboard", "GET /config", "GET /access"];
/** Fase 5: ações que o anfitrião só tem se liberadas (opt-in) ou nunca tem. */
const HOST_ONLY_IF_ALLOWED: readonly EventAction[] = [
  ...HOST_OPT_IN_ACTIONS,
  ...HOST_NEVER_ACTIONS,
];

interface RouteCase {
  method: string;
  pattern: string;
}

function enumerateRoutes(): RouteCase[] {
  const seen = new Map<string, RouteCase>();
  for (const r of app.routes) {
    if (!METHODS.has(r.method) || !r.path.startsWith(`${PREFIX}/`) || r.path.endsWith("*"))
      continue;
    seen.set(`${r.method} ${r.path}`, { method: r.method, pattern: r.path });
  }
  return [...seen.values()];
}

const SAMPLE: Record<string, string> = { kind: "buffet" };
const fill = (pattern: string, eventId: number) =>
  pattern.replace(/:(\w+)(\{[^}]*\})?/g, (_m, name: string) =>
    name === "eventId" ? String(eventId) : (SAMPLE[name] ?? "999999999"),
  );
const label = (r: RouteCase) => `${r.method} ${r.pattern.slice(PREFIX.length)}`;

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const routes = enumerateRoutes();
/*
 * Os testes que sondam todas as rotas do evento (mais de cem requisições em série, cada uma com
 * sessão e consultas) levam ~0,5 s sozinhos, mas passam dos 5 s padrão quando a suíte inteira
 * usa o mesmo MariaDB em paralelo. O limite maior vale só para eles; as asserções são as mesmas.
 */
const ALL_ROUTES_TIMEOUT = 60_000;

async function probe(r: RouteCase, kind: TestUserKind): Promise<number> {
  const isWrite = r.method !== "GET";
  const res = await app.request(fill(r.pattern, ev.eventA.id), {
    method: r.method,
    headers: {
      cookie: cookies[kind],
      ...(isWrite ? { "Content-Type": "application/json" } : {}),
    },
    body: isWrite ? "{}" : undefined,
  });
  await res.arrayBuffer();
  return res.status;
}

const call = (kind: TestUserKind, path: string, init: RequestInit = {}) =>
  app.request(path, {
    ...init,
    headers: { "Content-Type": "application/json", cookie: cookies[kind], ...init.headers },
  });

const permsPath = (orgId: number, eventId: number) =>
  `/api/admin/orgs/${orgId}/events/${eventId}/host-permissions`;

const setDeny = async (deny: readonly string[], kind: TestUserKind = "owner") => {
  const res = await call(kind, permsPath(ev.orgA.id, ev.eventA.id), {
    method: "PUT",
    body: JSON.stringify({ deny }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as HostPermissionsView;
};

const access = async (kind: TestUserKind) =>
  (await (await call(kind, `/api/admin/events/${ev.eventA.id}/access`)).json()) as EventAccessView;

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

describe("padrão: pode tudo", () => {
  it("sem a chave, GET devolve deny vazio e /access libera todas as ações", async () => {
    const res = await call("owner", permsPath(ev.orgA.id, ev.eventA.id));
    expect(await res.json()).toEqual({
      eventId: ev.eventA.id,
      deny: [],
      actions: [...HOST_CONFIGURABLE_ACTIONS],
      allow: [],
      optIn: [...HOST_OPT_IN_ACTIONS],
    });
    // Fase 5: menos as que o anfitrião nunca tem e as opt-in não liberadas.
    expect(await access("host")).toEqual({
      role: "event_host",
      allowed: EVENT_ACTIONS.filter((a) => !HOST_ONLY_IF_ALLOWED.includes(a)),
    });
  });
});

describe("toda rota do evento declara uma ação", () => {
  it(
    "anfitrião sem nenhuma ação configurável → 403 em tudo, menos o início",
    async () => {
      await setDeny(HOST_CONFIGURABLE_ACTIONS);
      const open: string[] = [];
      for (const r of routes) {
        const status = await probe(r, "host");
        if (status !== 403) open.push(label(r));
      }
      expect(open.sort()).toEqual([...ALWAYS].sort());
      expect(routes.length).toBeGreaterThan(30);
    },
    ALL_ROUTES_TIMEOUT,
  );

  it.each(["owner", "member", "platformAdmin"] as const)(
    "%s não é afetado pela lista do anfitrião",
    async (kind) => {
      for (const r of routes) {
        expect(await probe(r, kind), `${kind} ${label(r)}`).not.toBe(403);
      }
    },
    ALL_ROUTES_TIMEOUT,
  );

  it("/access do anfitrião só traz o início; o dono continua com tudo", async () => {
    expect(await access("host")).toEqual({ role: "event_host", allowed: ["dashboard.read"] });
    expect((await access("owner")).allowed).toEqual([...EVENT_ACTIONS]);
  });
});

describe("negar uma ação", () => {
  it("orders.refund: anfitrião leva 403 no reembolso, o resto dos pedidos continua", async () => {
    const view = await setDeny(["orders.refund"]);
    expect(view.deny).toEqual(["orders.refund"]);
    const refund = `/api/admin/events/${ev.eventA.id}/orders/inexistente/refund`;
    expect((await call("host", refund, { method: "POST" })).status).toBe(403);
    expect((await call("owner", refund, { method: "POST" })).status).not.toBe(403);
    expect((await call("host", `/api/admin/events/${ev.eventA.id}/orders`)).status).toBe(200);
    const allowed = (await access("host")).allowed;
    expect(allowed).not.toContain("orders.refund");
    expect(allowed).toContain("orders.read");
  });

  it("negar a leitura nega as escritas da área (gravado e aplicado)", async () => {
    const view = await setDeny(["gifts.read"]);
    expect(view.deny).toEqual(["gifts.read", "gifts.write"]);
    expect(withDependents(["orders.read"])).toEqual([
      "orders.read",
      "orders.refund",
      "orders.reconcile",
    ]);
    const gifts = `/api/admin/events/${ev.eventA.id}/gifts`;
    expect((await call("host", gifts)).status).toBe(403);
    expect((await call("host", gifts, { method: "POST", body: "{}" })).status).toBe(403);
    expect((await call("owner", gifts)).status).toBe(200);
  });

  it("sem settings.read, o QR dos convites ainda carrega o cabeçalho do cartão", async () => {
    await setDeny(["settings.read"]);
    const base = `/api/admin/events/${ev.eventA.id}`;
    expect((await call("host", `${base}/settings`)).status).toBe(403);
    const card = await call("host", `${base}/invitations/card`);
    expect(card.status).toBe(200);
    expect(Object.keys((await card.json()) as object).sort()).toEqual([
      "datetime",
      "monogram",
      "names",
    ]);
  });

  it("Fase 4: cada área de gestão tem a sua leitura (tarefas, fornecedores, financeiro, cronograma)", async () => {
    const base = `/api/admin/events/${ev.eventA.id}`;
    const areas = [
      ["tasks.read", ["/tasks", "/tasks/assignees", "/tasks/templates"]],
      ["vendors.read", ["/vendors", "/vendor-catalog"]],
      ["budget.read", ["/budget", "/quotes"]],
      ["schedule.read", ["/schedule"]],
    ] as const;
    for (const [action, paths] of areas) {
      const view = await setDeny([action]);
      expect(view.deny, action).toContain(action.replace(".read", ".write"));
      for (const path of paths) {
        expect((await call("host", `${base}${path}`)).status, `${action} ${path}`).toBe(403);
        expect((await call("owner", `${base}${path}`)).status, `dono ${path}`).toBe(200);
      }
      // As outras áreas continuam abertas ao anfitrião.
      for (const [other, otherPaths] of areas) {
        if (other === action) continue;
        expect((await call("host", `${base}${otherPaths[0]}`)).status, other).toBe(200);
      }
    }
    // Só a escrita negada: lê, mas não cria orçamento nem marca parcela.
    await setDeny(["budget.write"]);
    expect((await call("host", `${base}/budget`)).status).toBe(200);
    expect((await call("host", `${base}/quotes`, { method: "POST", body: "{}" })).status).toBe(403);
    expect(
      (await call("host", `${base}/installments/999999999`, { method: "PATCH", body: "{}" }))
        .status,
    ).toBe(403);
  });

  it("liberar de novo vale na hora", async () => {
    await setDeny([]);
    const gifts = `/api/admin/events/${ev.eventA.id}/gifts`;
    expect((await call("host", gifts)).status).toBe(200);
  });
});

describe("quem ajusta as permissões", () => {
  it("membro da org grava; platform admin também", async () => {
    expect((await setDeny(["messages.moderate"], "member")).deny).toEqual(["messages.moderate"]);
    expect((await setDeny([], "platformAdmin")).deny).toEqual([]);
  });

  it("anfitrião e dono de outra org → 404 de rota", async () => {
    for (const kind of ["host", "stranger"] as const) {
      for (const method of ["GET", "PUT"]) {
        const res = await call(kind, permsPath(ev.orgA.id, ev.eventA.id), {
          method,
          body: method === "PUT" ? JSON.stringify({ deny: [] }) : undefined,
        });
        expect(res.status, `${kind} ${method}`).toBe(404);
      }
    }
  });

  it("evento de outra org pelo caminho da org A → 404", async () => {
    const res = await call("owner", permsPath(ev.orgA.id, ev.eventB.id), {
      method: "PUT",
      body: JSON.stringify({ deny: [] }),
    });
    expect(res.status).toBe(404);
  });

  it("ação desconhecida ou dashboard.read → recusa", async () => {
    for (const deny of [["dashboard.read"], ["nada.disso"], "x"]) {
      const res = await call("owner", permsPath(ev.orgA.id, ev.eventA.id), {
        method: "PUT",
        body: JSON.stringify({ deny }),
      });
      expect(res.status, JSON.stringify(deny)).toBe(422);
    }
  });

  it("o PUT genérico de /settings do evento recusa a chave", async () => {
    for (const kind of ["host", "owner"] as const) {
      const res = await call(kind, `/api/admin/events/${ev.eventA.id}/settings`, {
        method: "PUT",
        body: JSON.stringify({ values: { "event.host_permissions": { deny: [] } } }),
      });
      expect(res.status, kind).toBe(422);
    }
  });
});
