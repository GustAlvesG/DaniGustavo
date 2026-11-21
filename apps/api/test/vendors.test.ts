import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, eventVendors, quotes, scheduleItems } from "@casamento/db";
import {
  CONTRACT_MAX_BYTES,
  type ContractRow,
  type EventVendorRow,
  type VendorRow,
} from "@casamento/shared";
import type { Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 4, frente B: catálogo de fornecedores da organização, fornecedores do evento e contratos
// (área privada do Storage). Evento A (org A): host, owner, member; stranger é dono da org B.

const mailer: Mailer = { send: () => Promise.resolve() };
const uploadDir = await mkdtemp(join(tmpdir(), "casamento-vendors-"));
const { app, db } = testApp(
  { mailer, revalidate: () => Promise.resolve() },
  { UPLOAD_DIR: uploadDir },
);

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

let t!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const orgUrl = (orgId: number, path = "") => `/api/admin/orgs/${orgId}/vendors${path}`;
const evUrl = (eventId: number, path = "") => `/api/admin/events/${eventId}/vendors${path}`;
const privateDir = () => join(uploadDir, String(t.eventA.id), "private");

const call = (kind: TestUserKind, url: string, method = "GET", body?: unknown) =>
  app.request(url, {
    method,
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
  });
const json = async <T>(res: Response) => (await res.json()) as T;

function upload(
  kind: TestUserKind,
  eventId: number,
  evVendorId: number,
  bytes: Uint8Array,
  name = "contrato.pdf",
  title = "Contrato",
) {
  const form = new FormData();
  form.set("file", new File([bytes as Uint8Array<ArrayBuffer>], name));
  form.set("title", title);
  return app.request(evUrl(eventId, `/${evVendorId}/contracts`), {
    method: "POST",
    headers: { cookie: cookies[kind] },
    body: form,
  });
}

const newVendor = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  category: "buffet",
  ...extra,
});

async function createVendor(
  kind: TestUserKind,
  orgId: number,
  name: string,
  extra: Record<string, unknown> = {},
) {
  const res = await call(kind, orgUrl(orgId), "POST", newVendor(name, extra));
  expect(res.status).toBe(201);
  return (await json<{ vendor: VendorRow }>(res)).vendor;
}

async function link(kind: TestUserKind, eventId: number, body: unknown) {
  const res = await call(kind, evUrl(eventId), "POST", body);
  return { res, vendor: ((await res.clone().json()) as { vendor?: EventVendorRow }).vendor };
}

async function setHostDeny(deny: string[]) {
  const res = await call(
    "owner",
    `/api/admin/orgs/${t.orgA.id}/events/${t.eventA.id}/host-permissions`,
    "PUT",
    { deny },
  );
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  t = await createTestEvents(db);
  for (const k of ["host", "owner", "member", "stranger"] as const) {
    cookies[k] = await t.login(app, k);
  }
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("catálogo da organização", () => {
  it("cria, lista, edita, avalia e arquiva", async () => {
    const created = await createVendor("owner", t.orgA.id, "Buffet Sabor", {
      document: "12.345.678/0001-95",
      email: "contato@sabor.com",
      rating: 4,
    });
    expect(created).toMatchObject({ document: "12345678000195", rating: 4, eventCount: 0 });

    const url = orgUrl(t.orgA.id, `/${created.id}`);
    const patched = await call("member", url, "PATCH", { notes: "Ótimo", rating: 5 });
    expect(patched.status).toBe(200);
    expect((await json<{ vendor: VendorRow }>(patched)).vendor).toMatchObject({
      notes: "Ótimo",
      rating: 5,
      document: "12345678000195",
      email: "contato@sabor.com",
    });
    // PATCH sem `rating` não zera a nota.
    const again = await call("owner", url, "PATCH", { name: "Sabor" });
    expect((await json<{ vendor: VendorRow }>(again)).vendor).toMatchObject({
      name: "Sabor",
      rating: 5,
    });

    const arch = await call("owner", url, "PATCH", { archived: true });
    expect((await json<{ vendor: VendorRow }>(arch)).vendor.archived).toBe(true);
    const visible = await json<{ vendors: VendorRow[] }>(await call("owner", orgUrl(t.orgA.id)));
    expect(visible.vendors.some((v) => v.id === created.id)).toBe(false);
    const all = await json<{ vendors: VendorRow[] }>(
      await call("owner", `${orgUrl(t.orgA.id)}?archived=1`),
    );
    expect(all.vendors.some((v) => v.id === created.id)).toBe(true);
  });

  it("documento: só dígitos, com 11 ou 14", async () => {
    const cpf = await createVendor("owner", t.orgA.id, "Fotógrafo CPF", {
      category: "fotografia",
      document: "529.982.247-25",
    });
    expect(cpf.document).toBe("52998224725");
    for (const document of ["123", "1234567890123", "abc"]) {
      const res = await call("owner", orgUrl(t.orgA.id), "POST", newVendor("X", { document }));
      expect(res.status, document).toBe(422);
    }
    const url = orgUrl(t.orgA.id, `/${cpf.id}`);
    expect((await call("owner", url, "PATCH", { document: "12" })).status).toBe(422);
    const cleared = await call("owner", url, "PATCH", { document: null });
    expect((await json<{ vendor: VendorRow }>(cleared)).vendor.document).toBeNull();
  });

  it("categoria fora da lista → 422", async () => {
    const res = await call("owner", orgUrl(t.orgA.id), "POST", newVendor("Y", { category: "x" }));
    expect(res.status).toBe(422);
  });

  it("outra organização e anfitrião: 404; fornecedor alheio: 404", async () => {
    const mine = await createVendor("owner", t.orgA.id, "Só da A");
    const theirs = await createVendor("stranger", t.orgB.id, "Só da B");
    expect((await call("stranger", orgUrl(t.orgA.id))).status).toBe(404);
    expect((await call("host", orgUrl(t.orgA.id))).status).toBe(404);
    expect((await call("owner", orgUrl(t.orgB.id))).status).toBe(404);
    // id da org B pela rota da A.
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const res = await call(
        "owner",
        orgUrl(t.orgA.id, `/${theirs.id}`),
        method,
        method === "PATCH" ? {} : undefined,
      );
      expect(res.status, method).toBe(404);
    }
    expect((await call("stranger", orgUrl(t.orgB.id, `/${mine.id}`))).status).toBe(404);
    const listed = await json<{ vendors: VendorRow[] }>(await call("owner", orgUrl(t.orgA.id)));
    expect(listed.vendors.some((v) => v.id === theirs.id)).toBe(false);
  });

  it("apagar fornecedor em uso → 409; sem uso, apaga", async () => {
    const used = await createVendor("owner", t.orgA.id, "Em uso");
    const { res } = await link("owner", t.eventA.id, { vendorId: used.id });
    expect(res.status).toBe(201);
    expect((await call("owner", orgUrl(t.orgA.id, `/${used.id}`), "DELETE")).status).toBe(409);
    const detail = await json<{ vendor: VendorRow; events: { id: number }[] }>(
      await call("owner", orgUrl(t.orgA.id, `/${used.id}`)),
    );
    expect(detail.vendor.eventCount).toBe(1);
    expect(detail.events.map((e) => e.id)).toEqual([t.eventA.id]);

    const free = await createVendor("owner", t.orgA.id, "Sem uso");
    expect((await call("owner", orgUrl(t.orgA.id, `/${free.id}`), "DELETE")).status).toBe(200);
  });
});

describe("fornecedores do evento", () => {
  it("liga do catálogo, cadastra na hora, repete → 409, edita status e lista", async () => {
    const cat = await createVendor("owner", t.orgA.id, "Floricultura Rosa", {
      category: "flores",
    });
    const first = await link("owner", t.eventA.id, { vendorId: cat.id });
    expect(first.vendor).toMatchObject({
      category: "flores",
      status: "prospect",
      contractCount: 0,
    });
    expect((await link("owner", t.eventA.id, { vendorId: cat.id })).res.status).toBe(409);

    const fresh = await link("owner", t.eventA.id, {
      vendor: newVendor("DJ Novo", { category: "musica" }),
      status: "hired",
    });
    expect(fresh.res.status).toBe(201);
    expect(fresh.vendor).toMatchObject({ category: "musica", status: "hired" });
    const catalog = await json<{ vendors: VendorRow[] }>(await call("owner", orgUrl(t.orgA.id)));
    expect(catalog.vendors.some((v) => v.name === "DJ Novo")).toBe(true);

    const patch = await call("owner", evUrl(t.eventA.id, `/${first.vendor!.id}`), "PATCH", {
      status: "dismissed",
      notes: "Caro",
    });
    expect((await json<{ vendor: EventVendorRow }>(patch)).vendor).toMatchObject({
      status: "dismissed",
      notes: "Caro",
    });
    const list = await json<{ vendors: EventVendorRow[] }>(await call("owner", evUrl(t.eventA.id)));
    expect(list.vendors.map((v) => v.id)).toContain(first.vendor!.id);
    // Nada do evento A aparece no evento B.
    const other = await json<{ vendors: EventVendorRow[] }>(
      await call("stranger", evUrl(t.eventB.id)),
    );
    expect(other.vendors).toEqual([]);
  });

  it("fornecedor de outra organização não se liga (404); arquivado → 422", async () => {
    const theirs = await createVendor("stranger", t.orgB.id, "Alheio");
    expect((await link("owner", t.eventA.id, { vendorId: theirs.id })).res.status).toBe(404);
    expect((await link("owner", t.eventA.id, { vendorId: 999999999 })).res.status).toBe(404);
    const mine = await createVendor("owner", t.orgA.id, "Arquivado");
    await call("owner", orgUrl(t.orgA.id, `/${mine.id}`), "PATCH", { archived: true });
    expect((await link("owner", t.eventA.id, { vendorId: mine.id })).res.status).toBe(422);
    const both = await link("owner", t.eventA.id, { vendorId: 1, vendor: newVendor("Z") });
    expect(both.res.status).toBe(422);
  });

  it("evento e vínculo de outro evento: 404", async () => {
    const mine = await link("owner", t.eventA.id, {
      vendor: newVendor("Local do A", { category: "local" }),
    });
    const id = mine.vendor!.id;
    expect((await call("stranger", evUrl(t.eventA.id))).status).toBe(404);
    expect((await call("stranger", evUrl(t.eventB.id, `/${id}`), "PATCH", {})).status).toBe(404);
    expect((await call("stranger", evUrl(t.eventB.id, `/${id}`), "DELETE")).status).toBe(404);
    expect((await call("stranger", evUrl(t.eventB.id, `/${id}/contracts`))).status).toBe(404);
    expect((await upload("stranger", t.eventB.id, id, PDF)).status).toBe(404);
  });

  it("catálogo visível ao anfitrião, que cadastra ao ligar mas não edita a organização", async () => {
    const res = await call("host", `/api/admin/events/${t.eventA.id}/vendor-catalog`);
    expect(res.status).toBe(200);
    const made = await link("host", t.eventA.id, {
      vendor: newVendor("Pelo anfitrião", { category: "doces" }),
    });
    expect(made.res.status).toBe(201);
    const listed = await json<{ vendors: VendorRow[] }>(await call("owner", orgUrl(t.orgA.id)));
    expect(listed.vendors.some((v) => v.name === "Pelo anfitrião")).toBe(true);
    expect((await call("host", orgUrl(t.orgA.id), "POST", newVendor("n"))).status).toBe(404);
  });

  it("remover: anula o cronograma e recusa com orçamento contratado", async () => {
    const a = await link("owner", t.eventA.id, { vendor: newVendor("Para remover") });
    const idA = a.vendor!.id;
    const [sch] = await db.insert(scheduleItems).values({
      eventId: t.eventA.id,
      startsAt: new Date("2030-01-01T18:00:00Z"),
      title: "Jantar",
      eventVendorId: idA,
    });
    const b = await link("owner", t.eventA.id, { vendor: newVendor("Contratado") });
    const idB = b.vendor!.id;
    const [q] = await db.insert(quotes).values({
      eventId: t.eventA.id,
      eventVendorId: idB,
      title: "Orçamento",
      category: "buffet",
      status: "contracted",
    });
    expect((await call("owner", evUrl(t.eventA.id, `/${idB}`), "DELETE")).status).toBe(409);
    expect((await call("owner", evUrl(t.eventA.id, `/${idA}`), "DELETE")).status).toBe(200);
    const [item] = await db
      .select()
      .from(scheduleItems)
      .where(and(eq(scheduleItems.id, sch.insertId), eq(scheduleItems.eventId, t.eventA.id)));
    expect(item?.eventVendorId).toBeNull();
    const [still] = await db
      .select()
      .from(eventVendors)
      .where(and(eq(eventVendors.id, idB), eq(eventVendors.eventId, t.eventA.id)));
    expect(still).toBeDefined();
    await db.delete(quotes).where(and(eq(quotes.id, q.insertId), eq(quotes.eventId, t.eventA.id)));
  });
});

describe("contratos", () => {
  let evVendor = 0;
  beforeAll(async () => {
    evVendor = (await link("owner", t.eventA.id, { vendor: newVendor("Com contratos") })).vendor!
      .id;
  });

  it("envia PDF e imagem, lista, baixa com a sessão e apaga", async () => {
    const res = await upload("owner", t.eventA.id, evVendor, PDF, "Contrato Sabor.pdf");
    expect(res.status).toBe(201);
    const { contract } = await json<{ contract: ContractRow }>(res);
    expect(contract).toMatchObject({
      mime: "application/pdf",
      originalName: "Contrato Sabor.pdf",
      bytes: PDF.byteLength,
    });
    const png = await json<{ contract: ContractRow }>(
      await upload("owner", t.eventA.id, evVendor, PNG, "foto.png", "Foto assinada"),
    );
    expect(png.contract.mime).toBe("image/png");

    const list = await json<{ contracts: ContractRow[] }>(
      await call("owner", evUrl(t.eventA.id, `/${evVendor}/contracts`)),
    );
    expect(list.contracts).toHaveLength(2);

    const file = await call("owner", contract.downloadUrl);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);

    // Fica na área privada e nunca sai por /uploads.
    const stored = await readdir(privateDir());
    expect(stored.length).toBeGreaterThanOrEqual(2);
    for (const f of stored) {
      expect((await app.request(`/uploads/${t.eventA.id}/private/${f}`)).status).toBe(404);
      expect((await app.request(`/uploads/${t.eventA.id}/${f}`)).status).toBe(404);
    }

    const del = await call("owner", contract.downloadUrl.replace(/\/file$/, ""), "DELETE");
    expect(del.status).toBe(200);
    expect((await call("owner", contract.downloadUrl)).status).toBe(404);
    expect(await readdir(privateDir())).toHaveLength(stored.length - 1);
  });

  it("tipo falso (extensão certa, bytes errados) e vazio → 422", async () => {
    const fake = new TextEncoder().encode("MZ isto não é um pdf");
    const before = await readdir(privateDir()).catch(() => []);
    expect((await upload("owner", t.eventA.id, evVendor, fake, "contrato.pdf")).status).toBe(422);
    expect((await upload("owner", t.eventA.id, evVendor, fake, "foto.png")).status).toBe(422);
    expect(
      (await upload("owner", t.eventA.id, evVendor, new Uint8Array(0), "vazio.pdf")).status,
    ).toBe(422);
    const noFile = await app.request(evUrl(t.eventA.id, `/${evVendor}/contracts`), {
      method: "POST",
      headers: { cookie: cookies.owner },
      body: new FormData(),
    });
    expect(noFile.status).toBe(422);
    expect(await readdir(privateDir()).catch(() => [])).toEqual(before);
  });

  it("mais de 10 MB → 413", async () => {
    const big = new Uint8Array(CONTRACT_MAX_BYTES + 1);
    big.set(PDF);
    expect((await upload("owner", t.eventA.id, evVendor, big)).status).toBe(413);
  });

  it("contrato de outro fornecedor ou evento não baixa (404)", async () => {
    const mine = await json<{ contract: ContractRow }>(
      await upload("owner", t.eventA.id, evVendor, PDF),
    );
    const other = (await link("owner", t.eventA.id, { vendor: newVendor("Outro") })).vendor!.id;
    const wrongVendor = `/${other}/contracts/${mine.contract.id}/file`;
    expect((await call("owner", evUrl(t.eventA.id, wrongVendor))).status).toBe(404);
    expect((await call("stranger", mine.contract.downloadUrl)).status).toBe(404);
    const viaB = evUrl(t.eventB.id, `/${evVendor}/contracts/${mine.contract.id}/file`);
    expect((await call("stranger", viaB)).status).toBe(404);
  });

  it("sem sessão: 401; anfitrião sem vendors.read/write: 403", async () => {
    const mine = await json<{ contract: ContractRow }>(
      await upload("owner", t.eventA.id, evVendor, PDF),
    );
    expect((await app.request(mine.contract.downloadUrl)).status).toBe(401);
    try {
      await setHostDeny(["vendors.write"]);
      expect((await call("host", mine.contract.downloadUrl)).status).toBe(200);
      expect((await upload("host", t.eventA.id, evVendor, PDF)).status).toBe(403);
      const del = await call("host", mine.contract.downloadUrl.replace(/\/file$/, ""), "DELETE");
      expect(del.status).toBe(403);
      expect((await link("host", t.eventA.id, { vendor: newVendor("Q") })).res.status).toBe(403);

      await setHostDeny(["vendors.read", "vendors.write"]);
      expect((await call("host", mine.contract.downloadUrl)).status).toBe(403);
      expect((await call("host", evUrl(t.eventA.id))).status).toBe(403);
      expect((await call("host", evUrl(t.eventA.id, `/${evVendor}/contracts`))).status).toBe(403);
      const catalog = await call("host", `/api/admin/events/${t.eventA.id}/vendor-catalog`);
      expect(catalog.status).toBe(403);
    } finally {
      await setHostDeny([]);
    }
    expect((await call("host", mine.contract.downloadUrl)).status).toBe(200);
  });

  it("remover o fornecedor apaga os arquivos dos contratos", async () => {
    const v = (await link("owner", t.eventA.id, { vendor: newVendor("Efêmero") })).vendor!.id;
    await upload("owner", t.eventA.id, v, PDF);
    const before = (await readdir(privateDir())).length;
    expect((await call("owner", evUrl(t.eventA.id, `/${v}`), "DELETE")).status).toBe(200);
    expect((await readdir(privateDir())).length).toBe(before - 1);
  });
});
