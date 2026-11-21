import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, organizationUsage, quotes, vendorPortalLinks } from "@casamento/db";
import {
  ERROR_CODES,
  type ContractRow,
  type QuoteSummary,
  type VendorPortalDocument,
  type VendorPortalMe,
  type VendorPortalQuote,
  type VendorPortalSchedule,
  type VendorPortalTask,
} from "@casamento/shared";
import { clearSubscription, createPlan, dropPlans, setSubscription } from "./plan-fixtures.ts";
import { portalFixture, type PortalFixture } from "./vendor-portal-fixtures.ts";

// Fase 7, frente C: o portal do fornecedor, sem conta (`Authorization: Bearer <token>`).
// Evento A: fornecedores A1 e A2; evento B: B1. Cada um só vê o próprio vínculo.

let f!: PortalFixture;
let tokenA1 = "";
let tokenA2 = "";
let tokenB1 = "";
const TIGHT = `t-vp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF");
const GUEST = "Zuleica Portalvisto";

beforeAll(async () => {
  f = await portalFixture("vendor-portal");
  tokenA1 = (await f.newLink("owner", f.t.eventA.id, f.a1)).token;
  tokenA2 = (await f.newLink("owner", f.t.eventA.id, f.a2, { email: "luz@x.com" })).token;
  tokenB1 = (await f.newLink("stranger", f.t.eventB.id, f.b1)).token;

  // Roteiro: um item de cada fornecedor e um sem fornecedor.
  const item = async (title: string, eventVendorId: number | null, details: string) => {
    const res = await f.call("owner", f.evUrl(f.t.eventA.id, "/schedule"), "POST", {
      date: "2030-01-01",
      startTime: title === "Recepção" ? "18:00" : "16:00",
      endTime: "17:00",
      title,
      details,
      location: "Salão",
      responsible: "Cerimonialista Joana",
      eventVendorId,
    });
    expect(res.status).toBe(201);
  };
  await item("Montagem do buffet", f.a1, "Entrar pela porta dos fundos");
  await item("Fotos da família", f.a2, "Lista de fotos com a noiva");
  await item("Recepção", null, "Detalhe interno da equipe");

  // Tarefas: uma de cada fornecedor e uma da equipe.
  for (const [title, eventVendorId] of [
    ["Enviar cardápio", f.a1],
    ["Enviar portfólio", f.a2],
    ["Conferir lista", null],
  ] as const) {
    const res = await f.call("owner", f.evUrl(f.t.eventA.id, "/tasks"), "POST", {
      title,
      eventVendorId,
    });
    expect(res.status).toBe(201);
  }

  // Orçamento do A2 lançado pela equipe (valor que o A1 nunca pode ver).
  const q = await f.call("owner", f.evUrl(f.t.eventA.id, "/quotes"), "POST", {
    eventVendorId: f.a2,
    title: "Fotos completas",
    items: [{ description: "Cobertura", quantity: 1, unitCents: 777_777 }],
  });
  expect(q.status).toBe(201);

  // Um convidado no evento (o portal nunca mostra).
  const inv = await f.call("owner", f.evUrl(f.t.eventA.id, "/invitations"), "POST", {
    label: GUEST,
    side: "noiva",
    maxGuests: 1,
    guests: [{ name: GUEST }],
  });
  expect(inv.status).toBe(201);
});

afterAll(async () => {
  await clearSubscription(f.db, f.t.orgA.id);
  await dropPlans(f.db, [TIGHT]);
  await f.cleanup();
});

const get = async <T>(token: string, path: string) => {
  const res = await f.portal(token, path);
  expect(res.status, path).toBe(200);
  return (await res.json()) as T;
};

function upload(token: string, bytes: Uint8Array, name = "proposta.pdf", title = "Proposta") {
  const form = new FormData();
  form.set("file", new File([bytes as Uint8Array<ArrayBuffer>], name));
  form.set("title", title);
  return f.portal(token, "/documents", { method: "POST", body: form });
}

describe("credencial", () => {
  it("sem token, token errado, expirado ou revogado → o mesmo 401", async () => {
    const { token: expiring, created: exp } = await f.newLink("owner", f.t.eventA.id, f.a1);
    const { token: revoking, created: rev } = await f.newLink("owner", f.t.eventA.id, f.a1);
    expect((await f.portal(expiring, "/me")).status).toBe(200);
    await f.db
      .update(vendorPortalLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(eq(vendorPortalLinks.eventId, f.t.eventA.id), eq(vendorPortalLinks.id, exp.link.id)),
      );
    const revoked = await f.call(
      "owner",
      f.evUrl(f.t.eventA.id, `/vendors/${f.a1}/portal-links/${rev.link.id}/revoke`),
      "POST",
    );
    expect(revoked.status).toBe(200);

    const bodies = new Set<string>();
    for (const token of [null, "lixo", "A".repeat(43), expiring, revoking]) {
      for (const path of ["/me", "/schedule", "/quotes", "/documents/1/file"]) {
        const res = await f.portal(token, path);
        expect(res.status, `${token} ${path}`).toBe(401);
        bodies.add(await res.text());
      }
    }
    expect(bodies.size).toBe(1);
    // POST também (e sem X-Web-Key nem cookie).
    const post = await f.portal(revoking, "/quotes", { method: "POST", body: "{}" });
    expect(post.status).toBe(401);
  });

  it("o link vale várias vezes e grava o último uso", async () => {
    const { token, created } = await f.newLink("owner", f.t.eventA.id, f.a1);
    for (let i = 0; i < 3; i++) expect((await f.portal(token, "/me")).status).toBe(200);
    const [row] = await f.db
      .select()
      .from(vendorPortalLinks)
      .where(
        and(
          eq(vendorPortalLinks.eventId, f.t.eventA.id),
          eq(vendorPortalLinks.id, created.link.id),
        ),
      );
    expect(row!.lastUsedAt).not.toBeNull();
  });

  it("muitos tokens recusados do mesmo IP → 429", async () => {
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const res = await f.portal("B".repeat(43), "/me", { headers: { "X-Real-IP": "192.0.2.77" } });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe("o que o fornecedor vê", () => {
  it("/me: evento e o próprio fornecedor, nada da organização", async () => {
    const me = await get<VendorPortalMe>(tokenA1, "/me");
    expect(me.event.name).toBe(f.t.eventA.name);
    expect(me.vendor).toEqual({
      name: expect.stringContaining("Buffet Sabor"),
      category: "Buffet",
    });
    expect(Object.keys(me).sort()).toEqual(["event", "expiresAt", "vendor"]);
    expect(Object.keys(me.event).sort()).toEqual(["name", "startsAt", "timezone"]);
  });

  it("cronograma: todos os itens, detalhes só nos dele, sem responsável", async () => {
    const s = await get<VendorPortalSchedule>(tokenA1, "/schedule");
    expect(s.items).toHaveLength(3);
    const mine = s.items.filter((i) => i.mine);
    expect(mine.map((i) => i.title)).toEqual(["Montagem do buffet"]);
    expect(mine[0]!.details).toBe("Entrar pela porta dos fundos");
    for (const i of s.items.filter((x) => !x.mine)) expect(i.details).toBeNull();
    const text = JSON.stringify(s);
    expect(text).not.toContain("Cerimonialista Joana");
    expect(text).not.toContain("Lista de fotos");
    expect(text).not.toContain("Detalhe interno");
    for (const i of s.items) {
      expect(Object.keys(i).sort()).toEqual(
        ["date", "details", "endTime", "location", "mine", "startTime", "title"].sort(),
      );
    }
  });

  it("tarefas: só as atribuídas a ele", async () => {
    const { tasks } = await get<{ tasks: VendorPortalTask[] }>(tokenA1, "/tasks");
    expect(tasks.map((t) => t.title)).toEqual(["Enviar cardápio"]);
    expect(Object.keys(tasks[0]!).sort()).toEqual(
      ["description", "dueOn", "id", "status", "title"].sort(),
    );
    const other = await get<{ tasks: VendorPortalTask[] }>(tokenA2, "/tasks");
    expect(other.tasks.map((t) => t.title)).toEqual(["Enviar portfólio"]);
  });

  it("nunca vê convidados, valores nem nomes de outros fornecedores", async () => {
    let all = "";
    for (const path of ["/me", "/schedule", "/tasks", "/quotes", "/documents"]) {
      all += await (await f.portal(tokenA1, path)).text();
    }
    expect(all).not.toContain(GUEST);
    expect(all).not.toContain("777777");
    expect(all).not.toContain("Fotos completas");
    expect(all).not.toContain("Foto Luz");
    expect(all).not.toContain(`Org A`);
    expect(all).not.toMatch(/@/);
  });

  it("evento B só vê o evento B", async () => {
    const me = await get<VendorPortalMe>(tokenB1, "/me");
    expect(me.event.name).toBe(f.t.eventB.name);
    const s = await get<VendorPortalSchedule>(tokenB1, "/schedule");
    expect(s.items).toHaveLength(0);
    expect((await get<{ tasks: VendorPortalTask[] }>(tokenB1, "/tasks")).tasks).toHaveLength(0);
    expect((await get<{ quotes: VendorPortalQuote[] }>(tokenB1, "/quotes")).quotes).toHaveLength(0);
  });
});

describe("orçamento pelo portal", () => {
  it("entra como recebido, source portal, total calculado no servidor; aparece no financeiro", async () => {
    const res = await f.portal(tokenA1, "/quotes", {
      method: "POST",
      body: JSON.stringify({
        title: "Buffet completo",
        items: [
          { description: "Jantar", quantity: 100, unitCents: 15_000 },
          { description: "Bebidas", unitCents: 200_000 },
        ],
        discountCents: 50_000,
        validUntil: "2030-02-01",
        notes: "Inclui garçons",
        // Ignorados: o total e o status saem do servidor.
        totalCents: 1,
        status: "contracted",
      }),
    });
    expect(res.status).toBe(201);
    const { quote } = (await res.json()) as { quote: VendorPortalQuote };
    expect(quote).toMatchObject({
      title: "Buffet completo",
      status: "received",
      source: "portal",
      totalCents: 100 * 15_000 + 200_000 - 50_000,
    });

    const panel = (await (await f.call("owner", f.evUrl(f.t.eventA.id, "/quotes"))).json()) as {
      quotes: QuoteSummary[];
    };
    const row = panel.quotes.find((q) => q.id === quote.id)!;
    expect(row).toMatchObject({ status: "received", source: "portal", eventVendorId: f.a1 });
    expect(row.category).toBe("buffet");
    const [db] = await f.db
      .select({ link: quotes.portalLinkId, receivedAt: quotes.receivedAt })
      .from(quotes)
      .where(and(eq(quotes.eventId, f.t.eventA.id), eq(quotes.id, quote.id)));
    expect(db!.link).not.toBeNull();
    expect(db!.receivedAt).not.toBeNull();
    // Os lançados pela equipe continuam `panel`.
    expect(panel.quotes.find((q) => q.title === "Fotos completas")?.source).toBe("panel");

    // O A1 vê o próprio; o A2 não vê o do A1 (e vê o lançado pela equipe para ele).
    const mine = await get<{ quotes: VendorPortalQuote[] }>(tokenA1, "/quotes");
    expect(mine.quotes.map((q) => q.id)).toContain(quote.id);
    const other = await get<{ quotes: VendorPortalQuote[] }>(tokenA2, "/quotes");
    expect(other.quotes.map((q) => q.title)).toEqual(["Fotos completas"]);
  });

  it("itens inválidos, sem itens ou desconto maior que a soma → 422", async () => {
    const bad = [
      { title: "X", items: [] },
      { title: "", items: [{ description: "a", unitCents: 1 }] },
      { title: "X", items: [{ description: "a", unitCents: -1 }] },
      { title: "X", items: [{ description: "a", unitCents: 100 }], discountCents: 101 },
      { title: "X", items: [{ description: "a", unitCents: 100 }], validUntil: "2030-02-30" },
    ];
    for (const body of bad) {
      const res = await f.portal(tokenA1, "/quotes", {
        method: "POST",
        body: JSON.stringify(body),
      });
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
  });
});

describe("documentos pelo portal", () => {
  it("PDF vai para a área privada como portal; tipo falso pelos bytes → 422", async () => {
    const fake = await upload(tokenA1, new TextEncoder().encode("<html>oi</html>"), "x.pdf");
    expect(fake.status).toBe(422);
    const empty = await upload(tokenA1, new Uint8Array(), "vazio.pdf");
    expect(empty.status).toBe(422);
    const noTitle = await upload(tokenA1, PDF, "a.pdf", "");
    expect(noTitle.status).toBe(422);

    const res = await upload(tokenA1, PDF);
    expect(res.status).toBe(201);
    const { document } = (await res.json()) as { document: VendorPortalDocument };
    expect(document).toMatchObject({
      title: "Proposta",
      mime: "application/pdf",
      source: "portal",
      bytes: PDF.byteLength,
    });
    const files = await readdir(join(f.uploadDir, String(f.t.eventA.id), "private"));
    expect(files.some((n) => n.endsWith(".pdf"))).toBe(true);
    // Nada fora da área privada.
    const top = await readdir(join(f.uploadDir, String(f.t.eventA.id)));
    expect(top).toEqual(["private"]);

    // No painel, com o selo do portal.
    const contracts = (await (
      await f.call("owner", f.evUrl(f.t.eventA.id, `/vendors/${f.a1}/contracts`))
    ).json()) as { contracts: ContractRow[] };
    expect(contracts.contracts.find((c) => c.id === document.id)?.source).toBe("portal");

    // Download só do próprio.
    const file = await f.portal(tokenA1, `/documents/${document.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);
    expect((await f.portal(tokenA2, `/documents/${document.id}/file`)).status).toBe(404);
    expect((await f.portal(tokenB1, `/documents/${document.id}/file`)).status).toBe(404);
    const list = await get<{ documents: VendorPortalDocument[] }>(tokenA2, "/documents");
    expect(list.documents.some((d) => d.id === document.id)).toBe(false);
  });

  it("contrato enviado pela equipe aparece para o fornecedor dele", async () => {
    const form = new FormData();
    form.set("file", new File([PDF as Uint8Array<ArrayBuffer>], "assinado.pdf"));
    form.set("title", "Contrato assinado");
    const res = await f.app.request(f.evUrl(f.t.eventA.id, `/vendors/${f.a1}/contracts`), {
      method: "POST",
      headers: { cookie: f.cookies.owner },
      body: form,
    });
    expect(res.status).toBe(201);
    const { documents } = await get<{ documents: VendorPortalDocument[] }>(tokenA1, "/documents");
    expect(documents.find((d) => d.title === "Contrato assinado")?.source).toBe("panel");
  });

  it("limite de espaço do plano → 409 plan_limit", async () => {
    await createPlan(f.db, { code: TIGHT, limits: { storageMb: 1 } });
    await setSubscription(f.db, f.t.orgA.id, TIGHT);
    await f.db
      .insert(organizationUsage)
      .values({ organizationId: f.t.orgA.id, storageBytes: 1024 * 1024, computedAt: new Date() })
      .onDuplicateKeyUpdate({ set: { storageBytes: 1024 * 1024 } });
    const res = await upload(tokenA1, PDF);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      ERROR_CODES.planLimit,
    );
  });
});
