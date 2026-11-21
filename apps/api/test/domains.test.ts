import { createEventRecord, eq, eventDomains, events } from "@casamento/db";
import type { EventDomainView, EventDomainsResponse } from "@casamento/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkDomainTxt, setTxtResolver, verificationRecordName } from "../src/domains/dns.ts";
import { platformSubdomain } from "../src/domains/service.ts";
import { DOMAIN_VERIFY_LIMIT } from "../src/admin/org/domains.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 6, frente B: domínios do evento (subdomínio da plataforma e domínio próprio por TXT).

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const BASE = `eventos-${run}.teste.local`;
const rateLimiter = createRateLimiter();
const revalidated: number[] = [];
const { app, db } = testApp(
  {
    rateLimiter,
    revalidate: (eventId) => {
      revalidated.push(eventId);
      return Promise.resolve();
    },
  },
  { PLATFORM_BASE_DOMAIN: BASE, PLATFORM_HOST: `plataforma-${run}.teste.local` },
);
const noBase = testApp({ revalidate: () => Promise.resolve() });

/** DNS de mentira: nome → registros TXT, ou um código de erro do node:dns. */
const dns = new Map<string, string[][] | string>();

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const created: number[] = [];

beforeAll(async () => {
  setTxtResolver((name) => {
    const v = dns.get(name);
    if (v === undefined || typeof v === "string") {
      return Promise.reject(Object.assign(new Error("dns"), { code: v ?? "ENOTFOUND" }));
    }
    return Promise.resolve(v);
  });
  ev = await createTestEvents(db);
  for (const kind of ["owner", "member", "stranger", "host"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
});

afterAll(async () => {
  setTxtResolver(null);
  for (const id of created) await db.delete(events).where(eq(events.id, id));
  await ev?.cleanup();
  await db.$client.end();
  await noBase.db.$client.end();
});

beforeEach(() => {
  rateLimiter.reset();
  dns.clear();
});

const url = (eventId: number, path = "", orgId = ev.orgA.id) =>
  `/api/admin/orgs/${orgId}/events/${eventId}/domains${path}`;

async function call(method: string, path: string, kind: TestUserKind = "owner", body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      cookie: cookies[kind],
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function addCustom(host: string, eventId = ev.eventA.id) {
  const res = await call("POST", url(eventId), "owner", { host });
  expect(res.status).toBe(201);
  return ((await res.json()) as { domain: EventDomainView }).domain;
}

const resolves = async (host: string) =>
  (await app.request(`/api/hosts/${encodeURIComponent(host)}`)).status;

describe("lista", () => {
  it("mostra os domínios do evento e a base", async () => {
    const res = await call("GET", url(ev.eventA.id), "member");
    expect(res.status).toBe(200);
    const body = (await res.json()) as EventDomainsResponse;
    expect(body.baseDomain).toBe(BASE);
    expect(body.domains.map((d) => [d.host, d.isPrimary, d.verified])).toEqual([
      [ev.primaryHostA, true, true],
      [ev.secondaryHostA, false, true],
    ]);
  });
});

describe("domínio próprio", () => {
  it("nasce não verificado, com as instruções do TXT, e não resolve", async () => {
    const host = `proprio-${run}.com.br`;
    const d = await addCustom(host);
    expect(d).toMatchObject({ host, kind: "custom", verified: false, isPrimary: false });
    expect(d.verification?.txtName).toBe(`_plataforma-verificacao.${host}`);
    expect(d.verification?.txtValue).toMatch(/^plataforma-[0-9a-f]{32}$/);
    expect(d.verification?.target).toBe(`plataforma-${run}.teste.local`);
    expect(await resolves(host)).toBe(404);
  });

  it("verifica pelo TXT: sem registro, valor errado e falha do DNS gravam o motivo", async () => {
    const host = `verifica-${run}.com.br`;
    const d = await addCustom(host);
    const name = verificationRecordName(host);
    const verify = async () => {
      const res = await call("POST", url(ev.eventA.id, `/${d.id}/verify`));
      expect(res.status).toBe(200);
      return ((await res.json()) as { domain: EventDomainView }).domain;
    };

    let r = await verify();
    expect(r.verified).toBe(false);
    expect(r.checkError).toMatch(/Não encontramos o registro TXT/);
    expect(r.lastCheckedAt).not.toBeNull();

    dns.set(name, [["outro-valor"]]);
    r = await verify();
    expect(r.verified).toBe(false);
    expect(r.checkError).toMatch(/não confere/);

    dns.set(name, "ESERVFAIL");
    r = await verify();
    expect(r.checkError).toMatch(/Não deu para consultar o DNS agora \(ESERVFAIL\)/);
    expect(await resolves(host)).toBe(404);

    // TXT longo chega em pedaços: a conferência junta.
    const value = d.verification!.txtValue;
    dns.set(name, [["v=spf1 -all"], [value.slice(0, 10), value.slice(10)]]);
    r = await verify();
    expect(r.verified).toBe(true);
    expect(r.checkError).toBeNull();
    expect(r.verification).toBeNull();
    expect(revalidated).toContain(ev.eventA.id);
    expect(await resolves(host)).toBe(200);
  });

  it(`limite de ${DOMAIN_VERIFY_LIMIT} verificações por minuto por domínio`, async () => {
    const d = await addCustom(`limite-${run}.com.br`);
    for (let i = 0; i < DOMAIN_VERIFY_LIMIT; i++) {
      expect((await call("POST", url(ev.eventA.id, `/${d.id}/verify`))).status).toBe(200);
    }
    expect((await call("POST", url(ev.eventA.id, `/${d.id}/verify`))).status).toBe(429);
  });

  it("host já usado (neste ou em outro evento) → 409; host da plataforma → 422", async () => {
    const dup = await call("POST", url(ev.eventA.id), "owner", { host: ev.primaryHostA });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: { field?: string } }).error.field).toBe("host");

    const other = `outro-evento-${run}.com.br`;
    const res = await app.request(url(ev.eventB.id, "", ev.orgB.id), {
      method: "POST",
      headers: { cookie: cookies.stranger, "Content-Type": "application/json" },
      body: JSON.stringify({ host: other }),
    });
    expect(res.status).toBe(201);
    expect((await call("POST", url(ev.eventA.id), "owner", { host: other })).status).toBe(409);

    for (const host of [`x.${BASE}`, `plataforma-${run}.teste.local`, "semponto"]) {
      expect((await call("POST", url(ev.eventA.id), "owner", { host })).status, host).toBe(422);
    }
    expect((await call("POST", url(ev.eventA.id), "owner", { host: "não é host" })).status).toBe(
      422,
    );
  });

  it("primário só verificado; remover o primário passa o posto a outro verificado", async () => {
    const pending = await addCustom(`pendente-${run}.com.br`);
    expect((await call("POST", url(ev.eventA.id, `/${pending.id}/primary`))).status).toBe(409);

    const list = (await (await call("GET", url(ev.eventA.id))).json()) as EventDomainsResponse;
    const secondary = list.domains.find((d) => d.host === ev.secondaryHostA)!;
    const res = await call("POST", url(ev.eventA.id, `/${secondary.id}/primary`), "member");
    expect(res.status).toBe(200);
    const hostInfo = await app.request(`/api/hosts/${encodeURIComponent(ev.primaryHostA)}`);
    expect(await hostInfo.json()).toMatchObject({ primaryHost: ev.secondaryHostA });

    expect((await call("DELETE", url(ev.eventA.id, `/${secondary.id}`))).status).toBe(200);
    const after = (await (await call("GET", url(ev.eventA.id))).json()) as EventDomainsResponse;
    expect(after.domains.find((d) => d.host === ev.secondaryHostA)).toBeUndefined();
    expect(after.domains.filter((d) => d.isPrimary).map((d) => d.verified)).toEqual([true]);
  });
});

describe("subdomínio da plataforma", () => {
  it("cria <slug>.<base> verificado e primário (repetir devolve o mesmo)", async () => {
    const res = await app.request(url(ev.eventB.id, "/platform", ev.orgB.id), {
      method: "POST",
      headers: { cookie: cookies.stranger },
    });
    expect(res.status).toBe(200);
    const { domain } = (await res.json()) as { domain: EventDomainView };
    expect(domain).toMatchObject({
      host: `${ev.eventB.slug}.${BASE}`,
      kind: "platform",
      verified: true,
      isPrimary: true,
      verification: null,
    });
    expect(await resolves(domain.host)).toBe(200);
    const again = await app.request(url(ev.eventB.id, "/platform", ev.orgB.id), {
      method: "POST",
      headers: { cookie: cookies.stranger },
    });
    expect(((await again.json()) as { domain: EventDomainView }).domain.id).toBe(domain.id);

    // Único verificado e primário: não sai.
    const del = await app.request(url(ev.eventB.id, `/${domain.id}`, ev.orgB.id), {
      method: "DELETE",
      headers: { cookie: cookies.stranger },
    });
    expect(del.status).toBe(409);
  });

  it("sem PLATFORM_BASE_DOMAIN → 422", async () => {
    const cookie = await ev.login(noBase.app, "owner");
    const res = await noBase.app.request(url(ev.eventA.id, "/platform"), {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(422);
  });

  it("evento novo ganha o subdomínio quando há base", async () => {
    const slug = `t-sub-${run}`;
    const r = await createEventRecord(db, {
      organizationId: ev.orgA.id,
      slug,
      name: "Evento com subdomínio",
      type: "birthday",
      startsAt: "2031-05-01T20:00:00-03:00",
      platformBaseDomain: "festas.exemplo.com:3000",
    });
    created.push(r.id);
    expect(r.platformHost).toBe(`${slug}.festas.exemplo.com:3000`);
    const rows = await db.select().from(eventDomains).where(eq(eventDomains.eventId, r.id));
    expect(rows).toEqual([
      expect.objectContaining({ host: r.platformHost, kind: "platform", isPrimary: true }),
    ]);
    expect(rows[0]!.verifiedAt).not.toBeNull();

    const slug2 = `t-sub2-${run}`;
    const r2 = await createEventRecord(db, {
      organizationId: ev.orgA.id,
      slug: slug2,
      name: "Evento com domínio",
      type: "birthday",
      startsAt: "2031-05-01T20:00:00-03:00",
      host: `${slug2}.com.br`,
      platformBaseDomain: "festas.exemplo.com",
    });
    created.push(r2.id);
    const rows2 = await db.select().from(eventDomains).where(eq(eventDomains.eventId, r2.id));
    expect(rows2.map((d) => [d.host, d.kind, d.isPrimary])).toEqual([
      [`${slug2}.com.br`, "custom", true],
      [`${slug2}.festas.exemplo.com`, "platform", false],
    ]);

    const r3 = await createEventRecord(db, {
      organizationId: ev.orgA.id,
      slug: `t-sub3-${run}`,
      name: "Sem base",
      type: "birthday",
      startsAt: "2031-05-01T20:00:00-03:00",
      platformBaseDomain: null,
    });
    created.push(r3.id);
    expect(r3.platformHost).toBeNull();
  });

  it("platformSubdomain leva a porta da base para o fim", () => {
    expect(platformSubdomain("ana", "localhost:3000")).toBe("ana.localhost:3000");
    expect(platformSubdomain("ana", "Eventos.Exemplo.com")).toBe("ana.eventos.exemplo.com");
  });
});

describe("isolamento", () => {
  it("organização alheia, anfitrião e evento de outra org → 404 de rota", async () => {
    for (const kind of ["stranger", "host"] as const) {
      const res = await call("GET", url(ev.eventA.id), kind);
      expect(res.status, kind).toBe(404);
    }
    // Evento da org B pelo caminho da org A.
    expect((await call("GET", url(ev.eventB.id))).status).toBe(404);
    expect((await call("POST", url(ev.eventB.id, "/platform"))).status).toBe(404);
  });

  it("domínio de outro evento pelo id → 404", async () => {
    const list = (await (
      await app.request(url(ev.eventB.id, "", ev.orgB.id), {
        headers: { cookie: cookies.stranger },
      })
    ).json()) as EventDomainsResponse;
    const foreign = list.domains[0]!;
    for (const [method, path] of [
      ["POST", `/${foreign.id}/verify`],
      ["POST", `/${foreign.id}/primary`],
      ["DELETE", `/${foreign.id}`],
    ] as const) {
      const res = await call(method, url(ev.eventA.id, path));
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    const [still] = await db.select().from(eventDomains).where(eq(eventDomains.id, foreign.id));
    expect(still).toBeDefined();
  });
});

describe("checkDomainTxt", () => {
  it("usa o resolvedor injetado e o nome _plataforma-verificacao.<host> sem porta", async () => {
    const asked: string[] = [];
    const r = await checkDomainTxt("ana.com.br:8080", "tok", (name) => {
      asked.push(name);
      return Promise.resolve([["tok"]]);
    });
    expect(r).toEqual({ ok: true, error: null });
    expect(asked).toEqual(["_plataforma-verificacao.ana.com.br"]);
    const empty = await checkDomainTxt("ana.com.br", "tok", () => Promise.resolve([]));
    expect(empty.ok).toBe(false);
  });
});
