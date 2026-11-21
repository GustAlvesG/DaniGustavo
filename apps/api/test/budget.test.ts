import { eventVendors, vendors } from "@casamento/db";
import {
  addMonths,
  isCalendarDate,
  planInstallments,
  splitCents,
  type BudgetView,
  type InstallmentRow,
  type QuoteSummary,
  type QuoteView,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeQuoteTotal, localDate } from "../src/budget/service.ts";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 4, frente C: orçamentos, parcelas e planejado × realizado.

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
/** event_vendors: buffet e fotografia no evento A; um no evento B (org B). */
const ids = { buffetA: 0, fotoA: 0, vendorB: 0 };

const call = (kind: TestUserKind, eventId: number, path: string, method = "GET", body?: unknown) =>
  app.request(`/api/admin/events/${eventId}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: cookies[kind] },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const a = (path: string, method = "GET", body?: unknown) =>
  call("owner", ev.eventA.id, path, method, body);

async function linkVendor(orgId: number, eventId: number, name: string, category: string) {
  const [v] = await db.insert(vendors).values({ organizationId: orgId, name, category });
  const [l] = await db
    .insert(eventVendors)
    .values({ eventId, organizationId: orgId, vendorId: v.insertId, category });
  return l.insertId;
}

const quoteBody = (eventVendorId: number, extra: Record<string, unknown> = {}) => ({
  eventVendorId,
  title: "Proposta",
  items: [
    { description: "Jantar", quantity: 120, unitCents: 15_050 },
    { description: "Garçons", quantity: 3, unitCents: 999 },
  ],
  discountCents: 100,
  ...extra,
});

async function newQuote(eventVendorId = ids.buffetA, extra: Record<string, unknown> = {}) {
  const res = await a("/quotes", "POST", quoteBody(eventVendorId, extra));
  expect(res.status).toBe(201);
  return ((await res.json()) as { quote: QuoteView }).quote;
}

const status = (id: number, body: Record<string, unknown>) =>
  a(`/quotes/${id}/status`, "POST", body);

/** Leva o orçamento até aprovado. */
async function approved(extra: Record<string, unknown> = {}) {
  const q = await newQuote(ids.buffetA, extra);
  expect((await status(q.id, { status: "approved" })).status).toBe(200);
  return q;
}

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "stranger"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
  ids.buffetA = await linkVendor(ev.orgA.id, ev.eventA.id, "Buffet Sabor", "buffet");
  ids.fotoA = await linkVendor(ev.orgA.id, ev.eventA.id, "Foto Luz", "fotografia");
  ids.vendorB = await linkVendor(ev.orgB.id, ev.eventB.id, "Buffet B", "buffet");
});

afterAll(async () => {
  await ev.cleanup();
  await db.$client.end();
});

describe("cálculos", () => {
  it("divide centavos sem perder o resto", () => {
    expect(splitCents(10_000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitCents(5, 3)).toEqual([2, 2, 1]);
    expect(splitCents(0, 2)).toEqual([0, 0]);
    for (const [total, n] of [
      [1_234_567, 7],
      [99, 10],
      [100, 1],
    ] as const) {
      const parts = splitCents(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((s, p) => s + p, 0)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    }
  });

  it("vencimentos mensais prendem o dia no fim do mês", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2027-11-15", 3)).toBe("2028-02-15");
    expect(planInstallments(10_000, 3, "2027-01-31")).toEqual([
      { dueOn: "2027-01-31", amountCents: 3334 },
      { dueOn: "2027-02-28", amountCents: 3333 },
      { dueOn: "2027-03-31", amountCents: 3333 },
    ]);
  });

  it("total = Σ(qtd × unitário) − desconto; desconto maior → 422", () => {
    expect(
      computeQuoteTotal({
        items: [
          { description: "a", quantity: 2, unitCents: 1050 },
          { description: "b", quantity: 3, unitCents: 1 },
        ],
        discountCents: 3,
      }),
    ).toBe(2100);
    expect(() =>
      computeQuoteTotal({
        items: [{ description: "a", quantity: 1, unitCents: 10 }],
        discountCents: 11,
      }),
    ).toThrow(/desconto/);
  });

  it("datas de calendário e data local no fuso do evento", () => {
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    // 01h UTC ainda é o dia anterior em São Paulo.
    expect(localDate(new Date("2027-04-11T01:00:00Z"), "America/Sao_Paulo")).toBe("2027-04-10");
  });
});

describe("orçamentos", () => {
  it("cria com total calculado no servidor e categoria do fornecedor no evento", async () => {
    const q = await newQuote();
    expect(q.totalCents).toBe(120 * 15_050 + 3 * 999 - 100);
    expect(q.items.map((i) => i.totalCents)).toEqual([120 * 15_050, 3 * 999]);
    expect(q).toMatchObject({
      category: "buffet",
      status: "draft",
      vendorName: "Buffet Sabor",
      vendorStatus: "prospect",
      paidCents: 0,
      installments: [],
    });
    const list = (await (await a("/quotes")).json()) as { quotes: QuoteSummary[] };
    expect(list.quotes.map((x) => x.id)).toContain(q.id);
    const filtered = (await (await a(`/quotes?eventVendorId=${ids.fotoA}`)).json()) as {
      quotes: QuoteSummary[];
    };
    expect(filtered.quotes.map((x) => x.id)).not.toContain(q.id);
  });

  it("edita (troca itens e recalcula) e apaga enquanto não contratado", async () => {
    const q = await newQuote();
    const res = await a(`/quotes/${q.id}`, "PUT", {
      ...quoteBody(ids.fotoA),
      category: "filmagem",
      items: [{ description: "Álbum", quantity: 1, unitCents: 50_000 }],
      discountCents: 0,
    });
    expect(res.status).toBe(200);
    const { quote } = (await res.json()) as { quote: QuoteView };
    expect(quote).toMatchObject({
      totalCents: 50_000,
      category: "filmagem",
      eventVendorId: ids.fotoA,
    });
    expect(quote.items).toHaveLength(1);
    expect((await a(`/quotes/${q.id}`, "DELETE")).status).toBe(200);
    expect((await a(`/quotes/${q.id}`)).status).toBe(404);
  });

  it("desconto maior que a soma e fornecedor de outro evento → 422", async () => {
    const res = await a("/quotes", "POST", quoteBody(ids.buffetA, { discountCents: 999_999_999 }));
    expect(res.status).toBe(422);
    const other = await a("/quotes", "POST", quoteBody(ids.vendorB));
    expect(other.status).toBe(422);
    expect(((await other.json()) as { error: { field?: string } }).error.field).toBe(
      "eventVendorId",
    );
    expect((await a("/quotes", "POST", { title: "x" })).status).toBe(422);
  });
});

describe("status", () => {
  it("transições inválidas → 422", async () => {
    const q = await newQuote();
    expect((await status(q.id, { status: "contracted", installments: [] })).status).toBe(422);
    expect((await status(q.id, { status: "draft" })).status).toBe(422);
    expect((await status(q.id, { status: "pago" })).status).toBe(422);
    const ok = await status(q.id, { status: "received" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { quote: QuoteView }).quote.status).toBe("received");
    expect((await status(q.id, { status: "declined" })).status).toBe(200);
    expect((await status(q.id, { status: "approved" })).status).toBe(422);
    expect((await status(q.id, { status: "draft" })).status).toBe(200);
  });

  it("contratar exige parcelas que somem o total (422)", async () => {
    const q = await approved({
      items: [{ description: "x", quantity: 1, unitCents: 10_000 }],
      discountCents: 0,
    });
    expect((await status(q.id, { status: "contracted" })).status).toBe(422);
    const wrong = await status(q.id, {
      status: "contracted",
      installments: [{ dueOn: "2027-01-10", amountCents: 9_999 }],
    });
    expect(wrong.status).toBe(422);
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toMatch(/somam/);
    const badDate = await status(q.id, {
      status: "contracted",
      installments: [{ dueOn: "2027-02-30", amountCents: 10_000 }],
    });
    expect(badDate.status).toBe(422);
    const after = (await (await a(`/quotes/${q.id}`)).json()) as { quote: QuoteView };
    expect(after.quote).toMatchObject({ status: "approved", installments: [] });
  });

  it("contratar grava as parcelas por vencimento, marca o fornecedor e fica imutável (409)", async () => {
    const q = await approved({
      items: [{ description: "x", quantity: 1, unitCents: 10_000 }],
      discountCents: 0,
    });
    const plan = planInstallments(10_000, 3, "2027-01-31").reverse();
    const res = await status(q.id, { status: "contracted", installments: plan });
    expect(res.status).toBe(200);
    const { quote } = (await res.json()) as { quote: QuoteView };
    expect(quote.status).toBe("contracted");
    expect(quote.vendorStatus).toBe("hired");
    expect(quote.installments.map((i) => [i.number, i.dueOn, i.amountCents])).toEqual([
      [1, "2027-01-31", 3334],
      [2, "2027-02-28", 3333],
      [3, "2027-03-31", 3333],
    ]);
    expect((await a(`/quotes/${q.id}`, "PUT", quoteBody(ids.buffetA))).status).toBe(409);
    expect((await a(`/quotes/${q.id}`, "DELETE")).status).toBe(409);
    for (const to of ["declined", "draft", "approved", "contracted"]) {
      const r = await status(q.id, { status: to });
      expect(r.status, to).toBe(422);
    }
  });
});

describe("parcelas", () => {
  async function contracted(total = 10_000, n = 3) {
    const q = await approved({
      items: [{ description: "x", quantity: 1, unitCents: total }],
      discountCents: 0,
    });
    const res = await status(q.id, {
      status: "contracted",
      installments: planInstallments(total, n, "2027-01-10"),
    });
    return ((await res.json()) as { quote: QuoteView }).quote;
  }
  const pay = (id: number, body: Record<string, unknown>) =>
    a(`/installments/${id}`, "PATCH", body);

  it("marca como paga e desfaz", async () => {
    const q = await contracted();
    const first = q.installments[0]!;
    const res = await pay(first.id, { paidOn: "2027-01-09", method: "Pix" });
    expect(res.status).toBe(200);
    const { installment } = (await res.json()) as { installment: InstallmentRow };
    expect(installment).toMatchObject({ paidAt: "2027-01-09", method: "Pix", overdue: false });
    const view = (await (await a(`/quotes/${q.id}`)).json()) as { quote: QuoteView };
    expect(view.quote.paidCents).toBe(3334);
    const undo = await pay(first.id, { paidOn: null });
    expect(((await undo.json()) as { installment: InstallmentRow }).installment).toMatchObject({
      paidAt: null,
      method: "Pix",
    });
    expect((await pay(first.id, { paidOn: "2027-13-01" })).status).toBe(422);
    expect((await pay(999_999_999, { paidOn: null })).status).toBe(404);
  });

  it("refazer o plano mantém as pagas e confere a soma", async () => {
    const q = await contracted();
    const [p1, p2] = q.installments;
    await pay(p2!.id, { paidOn: "2027-02-01" });
    const bad = await a(`/quotes/${q.id}/installments`, "PUT", {
      installments: [{ dueOn: "2027-05-01", amountCents: 10_000 }],
    });
    expect(bad.status).toBe(422);
    const res = await a(`/quotes/${q.id}/installments`, "PUT", {
      installments: [
        { dueOn: "2027-06-01", amountCents: 3_000 },
        { dueOn: "2027-01-05", amountCents: 3_667 },
      ],
    });
    expect(res.status).toBe(200);
    const { quote } = (await res.json()) as { quote: QuoteView };
    expect(quote.installments.map((i) => [i.number, i.dueOn, i.amountCents, i.paidAt])).toEqual([
      [1, "2027-01-05", 3_667, null],
      [2, "2027-02-10", 3_333, "2027-02-01"],
      [3, "2027-06-01", 3_000, null],
    ]);
    expect(quote.installments.find((i) => i.id === p2!.id)?.paidAt).toBe("2027-02-01");
    expect(quote.installments.some((i) => i.id === p1!.id)).toBe(false);
    expect(quote.paidCents).toBe(3_333);

    const notContracted = await newQuote();
    const r = await a(`/quotes/${notContracted.id}/installments`, "PUT", {
      installments: [{ dueOn: "2027-05-01", amountCents: 100 }],
    });
    expect(r.status).toBe(422);
  });
});

describe("planejado × contratado × pago", () => {
  it("soma por categoria e no total, com parcelas em aberto por vencimento", async () => {
    // Evento limpo para os números: usa o fornecedor de fotografia, sem orçamentos ainda.
    const put = await a("/budget", "PUT", {
      lines: [
        { category: "fotografia", plannedCents: 800_000, notes: "Foto e álbum" },
        { category: "flores", plannedCents: 200_000 },
      ],
    });
    expect(put.status).toBe(200);
    const q = await newQuote(ids.fotoA, {
      items: [{ description: "Cobertura", quantity: 1, unitCents: 600_000 }],
      discountCents: 0,
    });
    await status(q.id, { status: "approved" });
    const res = await status(q.id, {
      status: "contracted",
      installments: [
        { dueOn: "2020-01-10", amountCents: 200_000 },
        { dueOn: "2020-02-10", amountCents: 200_000 },
        { dueOn: "2099-03-10", amountCents: 200_000 },
      ],
    });
    const { quote } = (await res.json()) as { quote: QuoteView };
    await a(`/installments/${quote.installments[0]!.id}`, "PATCH", { paidOn: "2020-01-10" });

    const budget = (await (await a("/budget")).json()) as BudgetView;
    const foto = budget.categories.find((c) => c.category === "fotografia");
    expect(foto).toEqual({
      category: "fotografia",
      plannedCents: 800_000,
      contractedCents: 600_000,
      paidCents: 200_000,
      notes: "Foto e álbum",
    });
    expect(budget.categories.find((c) => c.category === "flores")).toMatchObject({
      plannedCents: 200_000,
      contractedCents: 0,
      paidCents: 0,
    });
    const sum = (k: "plannedCents" | "contractedCents" | "paidCents") =>
      budget.categories.reduce((s, c) => s + c[k], 0);
    expect(budget.totals).toEqual({
      plannedCents: sum("plannedCents"),
      contractedCents: sum("contractedCents"),
      paidCents: sum("paidCents"),
    });
    // Ordem fixa das categorias (VENDOR_CATEGORIES): buffet antes de fotografia antes de flores.
    const order = budget.categories.map((c) => c.category);
    expect(order.indexOf("fotografia")).toBeLessThan(order.indexOf("flores"));

    const open = budget.openInstallments.filter((i) => i.quoteId === quote.id);
    expect(open.map((i) => [i.dueOn, i.overdue, i.vendorName])).toEqual([
      ["2020-02-10", true, "Foto Luz"],
      ["2099-03-10", false, "Foto Luz"],
    ]);
    const dues = budget.openInstallments.map((i) => i.dueOn);
    expect([...dues].sort()).toEqual(dues);

    // Tirar a previsão: categoria sem nada some; categoria repetida → 422.
    const cleared = (await (await a("/budget", "PUT", { lines: [] })).json()) as BudgetView;
    expect(cleared.categories.find((c) => c.category === "flores")).toBeUndefined();
    expect(cleared.totals.plannedCents).toBe(0);
    const dup = await a("/budget", "PUT", {
      lines: [
        { category: "flores", plannedCents: 1 },
        { category: "flores", plannedCents: 2 },
      ],
    });
    expect(dup.status).toBe(422);
  });
});

describe("isolamento", () => {
  it("orçamento e parcela do evento A pelo evento B → 404; B não vê os de A", async () => {
    const q = await approved({
      items: [{ description: "x", quantity: 1, unitCents: 500 }],
      discountCents: 0,
    });
    const res = await status(q.id, {
      status: "contracted",
      installments: [{ dueOn: "2027-01-01", amountCents: 500 }],
    });
    const inst = ((await res.json()) as { quote: QuoteView }).quote.installments[0]!;
    const b = (path: string, method = "GET", body?: unknown) =>
      call("stranger", ev.eventB.id, path, method, body);
    expect((await b(`/quotes/${q.id}`)).status).toBe(404);
    expect((await b(`/quotes/${q.id}`, "PUT", quoteBody(ids.vendorB))).status).toBe(404);
    expect((await b(`/quotes/${q.id}`, "DELETE")).status).toBe(404);
    expect((await b(`/quotes/${q.id}/status`, "POST", { status: "declined" })).status).toBe(404);
    expect((await b(`/installments/${inst.id}`, "PATCH", { paidOn: "2027-01-01" })).status).toBe(
      404,
    );
    const list = (await (await b("/quotes")).json()) as { quotes: QuoteSummary[] };
    expect(list.quotes).toEqual([]);
    const budget = (await (await b("/budget")).json()) as BudgetView;
    expect(budget.openInstallments).toEqual([]);
    // Dono da org B no evento A: 404 de rota.
    expect((await call("stranger", ev.eventA.id, "/budget")).status).toBe(404);
    // A parcela continua em aberto no A.
    const again = (await (await a(`/quotes/${q.id}`)).json()) as { quote: QuoteView };
    expect(again.quote.installments[0]!.paidAt).toBeNull();
  });
});

describe("permissões do anfitrião", () => {
  const setDeny = async (deny: string[]) => {
    const res = await app.request(
      `/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/host-permissions`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: cookies.owner },
        body: JSON.stringify({ deny }),
      },
    );
    expect(res.status).toBe(200);
  };
  const host = (path: string, method = "GET", body?: unknown) =>
    call("host", ev.eventA.id, path, method, body);

  it("padrão: anfitrião usa o financeiro", async () => {
    expect((await host("/budget")).status).toBe(200);
    expect((await host("/quotes")).status).toBe(200);
  });

  it("sem budget.read → 403 na leitura e na escrita; sem budget.write só lê", async () => {
    await setDeny(["budget.read"]);
    expect((await host("/budget")).status).toBe(403);
    expect((await host("/quotes")).status).toBe(403);
    expect((await host("/quotes", "POST", quoteBody(ids.buffetA))).status).toBe(403);
    expect((await host("/budget", "PUT", { lines: [] })).status).toBe(403);

    await setDeny(["budget.write"]);
    expect((await host("/budget")).status).toBe(200);
    expect((await host("/quotes", "POST", quoteBody(ids.buffetA))).status).toBe(403);
    expect((await host("/installments/1", "PATCH", { paidOn: null })).status).toBe(403);
    await setDeny([]);
  });
});
