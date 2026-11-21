import { and, eq, eventVendors, quoteInstallments, vendors } from "@casamento/db";
import type { QuoteView } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 6, frente E: reabrir orçamento contratado (só sem parcela paga).

const mailer: Mailer = { send: () => Promise.resolve() };
const { app, db } = testApp({ mailer, revalidate: () => Promise.resolve() });

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
let evVendorA = 0;
let evVendorB = 0;

const call = (kind: TestUserKind, eventId: number, path: string, method = "GET", body?: unknown) =>
  app.request(`/api/admin/events/${eventId}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: cookies[kind] },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(res: Response) => (await res.json()) as T;

async function linkVendor(orgId: number, eventId: number, name: string) {
  const [v] = await db.insert(vendors).values({ organizationId: orgId, name, category: "buffet" });
  const [l] = await db.insert(eventVendors).values({
    eventId,
    organizationId: orgId,
    vendorId: v.insertId,
    category: "buffet",
  });
  return l.insertId;
}

async function contractedQuote(
  eventId = ev.eventA.id,
  vendorId = evVendorA,
  kind: TestUserKind = "owner",
) {
  const created = await call(kind, eventId, "/quotes", "POST", {
    eventVendorId: vendorId,
    title: "Proposta",
    items: [{ description: "Jantar", quantity: 1, unitCents: 30_000 }],
  });
  expect(created.status).toBe(201);
  const q = (await json<{ quote: QuoteView }>(created)).quote;
  expect(
    (await call(kind, eventId, `/quotes/${q.id}/status`, "POST", { status: "approved" })).status,
  ).toBe(200);
  const contracted = await call(kind, eventId, `/quotes/${q.id}/status`, "POST", {
    status: "contracted",
    installments: [
      { dueOn: "2027-01-10", amountCents: 10_000 },
      { dueOn: "2027-02-10", amountCents: 10_000 },
      { dueOn: "2027-03-10", amountCents: 10_000 },
    ],
  });
  expect(contracted.status).toBe(200);
  return (await json<{ quote: QuoteView }>(contracted)).quote;
}

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "stranger"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
  evVendorA = await linkVendor(ev.orgA.id, ev.eventA.id, "Buffet Reabrir");
  evVendorB = await linkVendor(ev.orgB.id, ev.eventB.id, "Buffet B Reabrir");
});

afterAll(async () => {
  await ev.cleanup();
  await db.$client.end();
});

describe("reabrir orçamento contratado", () => {
  it("sem parcela paga: volta a aprovado, apaga as parcelas e permite editar e contratar de novo", async () => {
    const q = await contractedQuote();
    expect(q.installments).toHaveLength(3);
    const res = await call("owner", ev.eventA.id, `/quotes/${q.id}/reopen`, "POST");
    expect(res.status).toBe(200);
    const reopened = (await json<{ quote: QuoteView }>(res)).quote;
    expect(reopened).toMatchObject({ status: "approved", installments: [], paidCents: 0 });
    const rows = await db
      .select()
      .from(quoteInstallments)
      .where(and(eq(quoteInstallments.eventId, ev.eventA.id), eq(quoteInstallments.quoteId, q.id)));
    expect(rows).toHaveLength(0);

    // Agora é editável de novo.
    const edit = await call("owner", ev.eventA.id, `/quotes/${q.id}`, "PUT", {
      eventVendorId: evVendorA,
      title: "Proposta revista",
      items: [{ description: "Jantar", quantity: 1, unitCents: 28_000 }],
    });
    expect(edit.status).toBe(200);
    const again = await call("owner", ev.eventA.id, `/quotes/${q.id}/status`, "POST", {
      status: "contracted",
      installments: [{ dueOn: "2027-04-10", amountCents: 28_000 }],
    });
    expect(again.status).toBe(200);
  });

  it("com parcela paga → 409 e nada muda", async () => {
    const q = await contractedQuote();
    const paid = await call(
      "owner",
      ev.eventA.id,
      `/installments/${q.installments[1]!.id}`,
      "PATCH",
      {
        paidOn: "2027-02-10",
      },
    );
    expect(paid.status).toBe(200);
    const res = await call("owner", ev.eventA.id, `/quotes/${q.id}/reopen`, "POST");
    expect(res.status).toBe(409);
    const after = await json<{ quote: QuoteView }>(
      await call("owner", ev.eventA.id, `/quotes/${q.id}`),
    );
    expect(after.quote.status).toBe("contracted");
    expect(after.quote.installments).toHaveLength(3);

    // Desfeito o pagamento, reabre.
    await call("owner", ev.eventA.id, `/installments/${q.installments[1]!.id}`, "PATCH", {
      paidOn: null,
    });
    expect((await call("owner", ev.eventA.id, `/quotes/${q.id}/reopen`, "POST")).status).toBe(200);
  });

  it("orçamento que não está contratado → 409", async () => {
    const created = await call("owner", ev.eventA.id, "/quotes", "POST", {
      eventVendorId: evVendorA,
      title: "Rascunho",
      items: [],
    });
    const q = (await json<{ quote: QuoteView }>(created)).quote;
    expect((await call("owner", ev.eventA.id, `/quotes/${q.id}/reopen`, "POST")).status).toBe(409);
  });

  it("orçamento de outro evento/organização → 404; sem login do evento → 404", async () => {
    const q = await contractedQuote();
    // O dono da org B não enxerga o evento A.
    expect((await call("stranger", ev.eventA.id, `/quotes/${q.id}/reopen`, "POST")).status).toBe(
      404,
    );
    // O id do orçamento do evento A, pedido pelo evento B: 404.
    expect((await call("stranger", ev.eventB.id, `/quotes/${q.id}/reopen`, "POST")).status).toBe(
      404,
    );
    // Evento B tem o seu próprio orçamento, que o dono de A não alcança.
    const own = await contractedQuote(ev.eventB.id, evVendorB, "stranger");
    expect((await call("owner", ev.eventA.id, `/quotes/${own.id}/reopen`, "POST")).status).toBe(
      404,
    );
  });

  it("anfitrião sem budget.write não reabre (403); com a permissão, reabre", async () => {
    const q = await contractedQuote();
    const deny = await call("owner", ev.eventA.id, "", "GET");
    void deny;
    const put = (denyList: string[]) =>
      app.request(`/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/host-permissions`, {
        method: "PUT",
        headers: { cookie: cookies.owner, "Content-Type": "application/json" },
        body: JSON.stringify({ deny: denyList }),
      });
    expect((await put(["budget.write"])).status).toBe(200);
    expect((await call("host", ev.eventA.id, `/quotes/${q.id}/reopen`, "POST")).status).toBe(403);
    expect((await put([])).status).toBe(200);
    expect((await call("host", ev.eventA.id, `/quotes/${q.id}/reopen`, "POST")).status).toBe(200);
  });
});
