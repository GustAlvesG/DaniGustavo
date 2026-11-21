import { and, eq, eventVendors, vendorCategories, vendors } from "@casamento/db";
import type {
  CategoryOption,
  EventVendorRow,
  QuoteView,
  VendorCategoryView,
  VendorRow,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 6, frente E: categorias de fornecedor da organização e fornecedor novo só pela organização.
// Evento A (org A): host, owner, member; stranger é dono da org B (evento B).

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });

let t!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const org = (orgId: number, path = "") => `/api/admin/orgs/${orgId}${path}`;
const evt = (eventId: number, path = "") => `/api/admin/events/${eventId}${path}`;
const call = (kind: TestUserKind, url: string, method = "GET", body?: unknown) =>
  app.request(url, {
    method,
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
  });
const json = async <T>(res: Response) => (await res.json()) as T;

async function createCategory(kind: TestUserKind, orgId: number, label: string) {
  const res = await call(kind, org(orgId, "/vendor-categories"), "POST", { label });
  return { res, category: (await res.clone().json()) as { category?: VendorCategoryView } };
}

beforeAll(async () => {
  t = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger"] as const) {
    cookies[kind] = await t.login(app, kind);
  }
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("categorias próprias da organização", () => {
  let key = "";

  it("cria com chave c-<slug> do rótulo; repetida → 409; vazia/sem letras → 422", async () => {
    const { res, category } = await createCategory("owner", t.orgA.id, "Segurança e Brigada");
    expect(res.status).toBe(201);
    expect(category.category).toMatchObject({
      key: "c-seguranca-e-brigada",
      label: "Segurança e Brigada",
      archived: false,
      usage: 0,
    });
    key = category.category!.key;
    expect((await createCategory("owner", t.orgA.id, "seguranca e brigada")).res.status).toBe(409);
    expect((await createCategory("owner", t.orgA.id, "   ")).res.status).toBe(422);
    expect((await createCategory("owner", t.orgA.id, "!!!")).res.status).toBe(422);
  });

  it("lista as próprias e as opções (18 fixas + própria)", async () => {
    const body = await json<{ categories: VendorCategoryView[]; options: CategoryOption[] }>(
      await call("member", org(t.orgA.id, "/vendor-categories")),
    );
    expect(body.categories.map((c) => c.key)).toContain(key);
    expect(body.options.filter((o) => !o.custom)).toHaveLength(18);
    expect(body.options.find((o) => o.key === key)).toMatchObject({ custom: true });
  });

  it("outra organização não vê nem altera (404/vazio) e não usa a chave", async () => {
    const b = await json<{ categories: VendorCategoryView[] }>(
      await call("stranger", org(t.orgB.id, "/vendor-categories")),
    );
    expect(b.categories.map((c) => c.key)).not.toContain(key);
    const [row] = await db
      .select()
      .from(vendorCategories)
      .where(and(eq(vendorCategories.organizationId, t.orgA.id), eq(vendorCategories.key, key)));
    const patch = await call("stranger", org(t.orgB.id, `/vendor-categories/${row!.id}`), "PATCH", {
      label: "Invadida",
    });
    expect(patch.status).toBe(404);
    // Usar a chave da org A na org B: categoria inválida.
    const res = await call("stranger", org(t.orgB.id, "/vendors"), "POST", {
      name: "Fornecedor B",
      category: key,
    });
    expect(res.status).toBe(422);
    // Sem acesso à org A pela URL.
    expect((await call("stranger", org(t.orgA.id, "/vendor-categories"))).status).toBe(404);
  });

  it("anfitrião não entra na organização", async () => {
    expect((await call("host", org(t.orgA.id, "/vendor-categories"))).status).toBe(404);
  });

  it("vale no catálogo da organização, no fornecedor do evento, no orçamento e no previsto", async () => {
    const res = await call("owner", org(t.orgA.id, "/vendors"), "POST", {
      name: "Segurança Alfa",
      category: key,
    });
    expect(res.status).toBe(201);
    const vendor = (await json<{ vendor: VendorRow }>(res)).vendor;
    expect(vendor.category).toBe(key);

    const linked = await call("owner", evt(t.eventA.id, "/vendors"), "POST", {
      vendorId: vendor.id,
    });
    expect(linked.status).toBe(201);
    const link = (await json<{ vendor: EventVendorRow }>(linked)).vendor;
    expect(link.category).toBe(key);

    const quote = await call("owner", evt(t.eventA.id, "/quotes"), "POST", {
      eventVendorId: link.id,
      title: "Proposta de segurança",
      items: [{ description: "Equipe", quantity: 1, unitCents: 50_000 }],
    });
    expect(quote.status).toBe(201);
    expect((await json<{ quote: QuoteView }>(quote)).quote.category).toBe(key);

    const plan = await call("owner", evt(t.eventA.id, "/budget"), "PUT", {
      lines: [{ category: key, plannedCents: 80_000, notes: null }],
    });
    expect(plan.status).toBe(200);
    const budget = await json<{ categories: { category: string; plannedCents: number }[] }>(plan);
    expect(budget.categories.find((c) => c.category === key)?.plannedCents).toBe(80_000);

    // O uso aparece na lista da organização (fornecedor + orçamento).
    const list = await json<{ categories: VendorCategoryView[] }>(
      await call("owner", org(t.orgA.id, "/vendor-categories")),
    );
    expect(list.categories.find((c) => c.key === key)?.usage).toBe(2);

    // As opções do evento incluem a categoria própria.
    const options = await json<{ options: CategoryOption[]; labels: Record<string, string> }>(
      await call("host", evt(t.eventA.id, "/vendor-catalog/categories")),
    );
    expect(options.options.some((o) => o.key === key && o.custom)).toBe(true);
    expect(options.labels[key]).toBe("Segurança e Brigada");
  });

  it("categoria de outra organização é recusada em fornecedor, orçamento e previsto do evento", async () => {
    const other = (await createCategory("stranger", t.orgB.id, "Só da B")).category.category!;
    const [v] = await db
      .insert(vendors)
      .values({ organizationId: t.orgA.id, name: "Forn A", category: "buffet" });
    const [l] = await db.insert(eventVendors).values({
      eventId: t.eventA.id,
      organizationId: t.orgA.id,
      vendorId: v.insertId,
      category: "buffet",
    });
    expect(
      (
        await call("owner", evt(t.eventA.id, `/vendors/${l.insertId}`), "PATCH", {
          category: other.key,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("owner", evt(t.eventA.id, "/quotes"), "POST", {
          eventVendorId: l.insertId,
          title: "X",
          category: other.key,
          items: [],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("owner", evt(t.eventA.id, "/budget"), "PUT", {
          lines: [{ category: other.key, plannedCents: 1, notes: null }],
        })
      ).status,
    ).toBe(422);
  });

  it("renomear e arquivar: a arquivada some das opções e não vale para novos usos", async () => {
    const [row] = await db
      .select()
      .from(vendorCategories)
      .where(and(eq(vendorCategories.organizationId, t.orgA.id), eq(vendorCategories.key, key)));
    const renamed = await call("owner", org(t.orgA.id, `/vendor-categories/${row!.id}`), "PATCH", {
      label: "Segurança",
    });
    expect(renamed.status).toBe(200);
    expect((await json<{ category: VendorCategoryView }>(renamed)).category.key).toBe(key);

    expect(
      (
        await call("owner", org(t.orgA.id, `/vendor-categories/${row!.id}`), "PATCH", {
          archived: true,
        })
      ).status,
    ).toBe(200);
    const options = await json<{ options: CategoryOption[]; labels: Record<string, string> }>(
      await call("owner", evt(t.eventA.id, "/vendor-catalog/categories")),
    );
    expect(options.options.some((o) => o.key === key)).toBe(false);
    // O rótulo de quem já usa continua disponível.
    expect(options.labels[key]).toBe("Segurança");
    const res = await call("owner", org(t.orgA.id, "/vendors"), "POST", {
      name: "Outro",
      category: key,
    });
    expect(res.status).toBe(422);
  });
});

describe("fornecedor novo no catálogo: só pela organização", () => {
  it("anfitrião cadastrando fornecedor novo pelo evento → 403; ligando um existente → 201", async () => {
    const denied = await call("host", evt(t.eventA.id, "/vendors"), "POST", {
      vendor: { name: "Novo do anfitrião", category: "buffet" },
    });
    expect(denied.status).toBe(403);
    const [created] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.organizationId, t.orgA.id), eq(vendors.name, "Novo do anfitrião")));
    expect(created).toBeUndefined();

    const existing = (
      await json<{ vendor: VendorRow }>(
        await call("owner", org(t.orgA.id, "/vendors"), "POST", {
          name: "Existente",
          category: "flores",
        }),
      )
    ).vendor;
    const linked = await call("host", evt(t.eventA.id, "/vendors"), "POST", {
      vendorId: existing.id,
    });
    expect(linked.status).toBe(201);
  });

  it("membro e dono da organização cadastram fornecedor novo pelo evento", async () => {
    for (const kind of ["member", "owner"] as const) {
      const res = await call(kind, evt(t.eventA.id, "/vendors"), "POST", {
        vendor: { name: `Novo de ${kind}`, category: "musica" },
      });
      expect(res.status).toBe(201);
    }
  });

  it("o evento marca vendors.catalog como ação que o anfitrião nunca tem", async () => {
    const hostAccess = await json<{ allowed: string[] }>(
      await call("host", evt(t.eventA.id, "/access")),
    );
    expect(hostAccess.allowed).not.toContain("vendors.catalog");
    const ownerAccess = await json<{ allowed: string[] }>(
      await call("owner", evt(t.eventA.id, "/access")),
    );
    expect(ownerAccess.allowed).toContain("vendors.catalog");
  });
});
