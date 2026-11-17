import { account, eq, guests, inArray, invitations, like, user } from "@casamento/db";
import type { GuestList, ImportPreview, ImportResult } from "@casamento/shared";
import { hashPassword } from "better-auth/crypto";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readXlsx } from "../src/admin/spreadsheet.ts";
import { testApp } from "./helpers.ts";

// Importação de convidados e listas pelo painel, contra o banco de DATABASE_URL. Os convites
// do teste levam o sufixo `run` no nome e são apagados no fim.

const run = Date.now().toString(36);
const { app, db } = testApp();
const email = `import-${run}@exemplo.com`;
const password = "senha-de-teste-123";
const userId = ulid();
let cookie = "";

const HEADER =
  "convite;lado;nome;tipo;faixa_etaria;telefone;email;acompanhante;max_pessoas;restricao_alimentar";
const CSV =
  `\uFEFF${HEADER}\r\n` +
  `Família Import ${run};Dani;Ana Import ${run};adulto;;(24) 99999-0001;ana@exemplo.com;sim;;Alergia a camarão\r\n` +
  `Família Import ${run};Dani;Lia Import ${run};criança;3-7;;;;;\r\n` +
  `Amigo Import ${run};Gustavo;Rui Import ${run};;;;;;;Vegetariano\r\n`;

const upload = (path: string, body: string | Uint8Array, name = "convidados.csv") => {
  const form = new FormData();
  form.append("file", new File([body], name));
  return app.request(`/api/admin/invitations/import${path}`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
};
const get = (path: string) => app.request(`/api/admin${path}`, { headers: { cookie } });

beforeAll(async () => {
  await db.insert(user).values({ id: userId, name: "Teste", email, emailVerified: true });
  await db.insert(account).values({
    id: ulid(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
  });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.77" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
});

afterAll(async () => {
  await db.delete(invitations).where(like(invitations.label, `%Import ${run}`));
  await db.delete(user).where(eq(user.id, userId));
  await db.$client.end();
});

describe("acesso", () => {
  it.each([
    ["POST", "/invitations/import/preview"],
    ["POST", "/invitations/import"],
    ["GET", "/invitations/import/modelo.xlsx"],
    ["GET", "/invitations/lists/buffet"],
    ["GET", "/invitations/lists/portaria.csv"],
  ])("%s %s sem sessão → 401", async (method, path) => {
    const res = await app.request(`/api/admin${path}`, { method });
    expect(res.status).toBe(401);
  });

  it("importação de outra origem → 403", async () => {
    const form = new FormData();
    form.append("file", new File([CSV], "x.csv"));
    const res = await app.request("/api/admin/invitations/import", {
      method: "POST",
      headers: { cookie, Origin: "https://malicioso.example" },
      body: form,
    });
    expect(res.status).toBe(403);
  });
});

describe("importação", () => {
  it("sem arquivo → 422", async () => {
    const res = await app.request("/api/admin/invitations/import/preview", {
      method: "POST",
      headers: { cookie },
      body: new FormData(),
    });
    expect(res.status).toBe(422);
  });

  it("arquivo inválido: prévia com erros e confirmação recusada", async () => {
    const bad = `${HEADER}\nFamília Ruim ${run};Noiva;Zé;;;;;;;\n`;
    const prev = await upload("/preview", bad);
    expect(prev.status).toBe(200);
    const { preview } = (await prev.json()) as { preview: ImportPreview };
    expect(preview.errorCount).toBe(1);
    expect(preview.rows[0]!.errors).toEqual(["Lado “Noiva” não reconhecido: use Dani ou Gustavo."]);
    const res = await upload("", bad);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      "A planilha tem 1 erro. Corrija e envie de novo.",
    );
    const sem = await upload("", "nome\nAna\n");
    expect(sem.status).toBe(422);
  });

  it("prévia → confirma → reimportar avisa duplicados", async () => {
    const prev = await upload("/preview", CSV);
    const { preview } = (await prev.json()) as { preview: ImportPreview };
    expect(preview.errorCount).toBe(0);
    expect(preview.toCreate).toEqual({ invitations: 2, guests: 3 });

    const res = await upload("", CSV);
    expect(res.status).toBe(201);
    const { result } = (await res.json()) as { result: ImportResult };
    expect(result.created).toEqual({ invitations: 2, guests: 3 });

    const [inv] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.label, `Família Import ${run}`));
    expect(inv).toMatchObject({ side: "dani", maxGuests: 3, allowPlusOne: true });
    expect(inv!.token).toMatch(/^[0-9A-Z]{26}$/);
    const gs = await db.select().from(guests).where(eq(guests.invitationId, inv!.id));
    expect(gs.map((g) => [g.name, g.isChild, g.ageRange, g.rsvpStatus])).toEqual([
      [`Ana Import ${run}`, false, null, "pending"],
      [`Lia Import ${run}`, true, "3-7", "pending"],
    ]);

    const again = await upload("/preview", CSV);
    const p2 = ((await again.json()) as { preview: ImportPreview }).preview;
    expect(p2.duplicates).toEqual({ invitations: 2, guests: 3 });
    expect(p2.toCreate).toEqual({ invitations: 0, guests: 0 });
    const dup = await upload("", CSV);
    expect(dup.status).toBe(422);
    expect(((await dup.json()) as { error: { message: string } }).error.message).toMatch(
      /Nada novo para importar/,
    );
  });

  it("modelos CSV e XLSX", async () => {
    const csv = await get("/invitations/import/modelo.csv");
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect([...new Uint8Array(await csv.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const xlsx = await get("/invitations/import/modelo.xlsx");
    expect(xlsx.headers.get("content-disposition")).toContain("modelo-convidados.xlsx");
    const rows = readXlsx(new Uint8Array(await xlsx.arrayBuffer()));
    expect(rows[0]?.slice(0, 3)).toEqual(["convite", "lado", "nome"]);
    expect(rows).toHaveLength(5);
  });
});

describe("listas", () => {
  beforeAll(async () => {
    const invs = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(like(invitations.label, `%Import ${run}`));
    await db
      .update(guests)
      .set({ rsvpStatus: "confirmed" })
      .where(
        inArray(
          guests.invitationId,
          invs.map((i) => i.id),
        ),
      );
  });

  it("buffet com restrições e totais", async () => {
    const res = await get("/invitations/lists/buffet");
    const { list } = (await res.json()) as { list: GuestList };
    expect(list.columns).toContain("Restrição alimentar");
    expect(list.rows).toContainEqual([
      `Ana Import ${run}`,
      `Família Import ${run}`,
      "Adulto",
      "",
      "Alergia a camarão",
    ]);
    expect(list.rows).toContainEqual([
      `Lia Import ${run}`,
      `Família Import ${run}`,
      "Criança",
      "3 a 7 anos",
      "",
    ]);
    expect(list.summary.map((s) => s.label)).toContain("Com restrição");
  });

  it("cerimonial (CSV) com restrição e telefone; portaria sem dados de saúde", async () => {
    const csv = await (await get("/invitations/lists/cerimonial.csv")).text();
    expect(csv).toContain(
      `Família Import ${run};Dani;Ana Import ${run};Adulto;;;Alergia a camarão;(24) 99999-0001`,
    );
    const portaria = await get("/invitations/lists/portaria.csv");
    expect(portaria.headers.get("content-disposition")).toContain("lista-portaria.csv");
    const text = await portaria.text();
    expect(text).toContain(`Rui Import ${run};Amigo Import ${run};Adulto;`);
    expect(text).not.toContain("Vegetariano");
    expect((await get("/invitations/lists/outra")).status).toBe(404);
  });
});
