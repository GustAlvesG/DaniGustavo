import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { runMigrations } from "../src/migrate.ts";
import { resetDatabase } from "../src/reset.ts";
import { eventSettings, gifts } from "../src/schema/app.ts";
import { account, user } from "../src/schema/auth.ts";
import { eventDomains, eventMembers, events, organizationMembers } from "../src/schema/tenancy.ts";
import { seed } from "../src/seed.ts";
import {
  addDomain,
  addUser,
  createEvent,
  createOrganization,
  listEvents,
  migrateUploads,
} from "../src/tenancy-admin.ts";
import { createTestDb } from "./helpers.ts";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
  await resetDatabase(db);
  await runMigrations(db);
  await seed(db, {});
});

afterAll(async () => {
  await db?.$client.end();
});

describe("org:create e event:create", () => {
  it("cria organização e rejeita slug repetido ou inválido", async () => {
    const org = await createOrganization(db, { slug: "acme", name: "Acme" });
    expect(org.id).toBeGreaterThan(1);
    await expect(createOrganization(db, { slug: "acme", name: "Outra" })).rejects.toThrow(
      /já existe/i,
    );
    await expect(createOrganization(db, { slug: "Acme Ltda", name: "x" })).rejects.toThrow(
      /slug inválido/i,
    );
  });

  it("cria evento em UTC com configurações neutras", async () => {
    const ev = await createEvent(db, {
      org: "acme",
      slug: "maria-e-joao",
      name: "Maria & João",
      type: "wedding",
      startsAt: "2028-05-20T16:00:00-03:00",
    });
    const [row] = await db.select().from(events).where(eq(events.id, ev.id));
    expect(row?.startsAt?.toISOString()).toBe("2028-05-20T19:00:00.000Z");
    expect(row).toMatchObject({ status: "draft", timezone: "America/Sao_Paulo" });
    const settings = await db.select().from(eventSettings).where(eq(eventSettings.eventId, ev.id));
    expect(Object.fromEntries(settings.map((s) => [s.key, s.value]))).toEqual({
      "couple.names": "Maria & João",
      "couple.monogram": "MJ",
      "wedding.datetime": "2028-05-20T16:00:00-03:00",
      "wedding.timezone": "America/Sao_Paulo",
    });
  });

  it("valida tipo, offset, organização e slug repetido", async () => {
    const base = {
      org: "acme",
      slug: "x1",
      name: "X",
      type: "wedding",
      startsAt: "2028-01-01T10:00:00Z",
    };
    await expect(createEvent(db, { ...base, type: "festa" })).rejects.toThrow(/tipo/i);
    await expect(createEvent(db, { ...base, startsAt: "2028-01-01T10:00:00" })).rejects.toThrow(
      /offset/,
    );
    await expect(createEvent(db, { ...base, org: "nao-existe" })).rejects.toThrow(/não encontrada/);
    await expect(createEvent(db, { ...base, slug: "maria-e-joao" })).rejects.toThrow(/já existe/i);
  });
});

describe("domain:add", () => {
  it("normaliza, valida e troca o primário", async () => {
    await addDomain(db, { event: "maria-e-joao", host: "Maria.Exemplo.com", primary: true });
    await addDomain(db, { event: "maria-e-joao", host: "outro.exemplo.com:3000", primary: true });
    const [first] = await db
      .select()
      .from(eventDomains)
      .where(eq(eventDomains.host, "maria.exemplo.com"));
    expect(first?.isPrimary).toBe(false);
    const [second] = await db
      .select()
      .from(eventDomains)
      .where(eq(eventDomains.host, "outro.exemplo.com:3000"));
    expect(second?.isPrimary).toBe(true);
    await expect(addDomain(db, { event: "maria-e-joao", host: "a_b.com" })).rejects.toThrow(
      /inválido/,
    );
    await expect(
      addDomain(db, { event: "maria-e-joao", host: "maria.exemplo.com" }),
    ).rejects.toThrow(/já está/);
  });
});

describe("user:add", () => {
  it("cria usuário com senha temporária e vínculo; repetir só vincula", async () => {
    const r = await addUser(db, {
      email: "Novo@Exemplo.com",
      name: "Novo",
      org: "acme",
      role: "owner",
    });
    expect(r.created).toBe(true);
    expect(r.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const accounts = await db.select().from(account).where(eq(account.userId, r.userId));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.password).not.toBe(r.temporaryPassword);

    const again = await addUser(db, {
      email: "novo@exemplo.com",
      name: "Novo",
      org: "acme",
      role: "owner",
    });
    expect(again).toMatchObject({ created: false, temporaryPassword: null, linked: false });

    const host = await addUser(db, {
      email: "novo@exemplo.com",
      name: "Novo",
      event: "maria-e-joao",
      role: "host",
    });
    expect(host).toMatchObject({ created: false, linked: true });
    const members = await db.select().from(eventMembers).where(eq(eventMembers.userId, r.userId));
    expect(members).toHaveLength(1);
    const orgMembers = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, r.userId));
    expect(orgMembers).toHaveLength(1);
  });

  it("marca admin da plataforma e valida combinações", async () => {
    const r = await addUser(db, { email: "adm@exemplo.com", name: "Adm", platformAdmin: true });
    const [u] = await db.select().from(user).where(eq(user.id, r.userId));
    expect(u?.platformRole).toBe("admin");
    await expect(addUser(db, { email: "x@exemplo.com", name: "X" })).rejects.toThrow(/--org/);
    await expect(
      addUser(db, { email: "x@exemplo.com", name: "X", org: "acme", role: "host" }),
    ).rejects.toThrow(/owner ou member/);
    await expect(
      addUser(db, { email: "x@exemplo.com", name: "X", event: "maria-e-joao", role: "owner" }),
    ).rejects.toThrow(/host/);
  });
});

describe("event:list", () => {
  it("lista eventos com organização e domínios", async () => {
    const list = await listEvents(db);
    const ev = list.find((e) => e.slug === "maria-e-joao");
    expect(ev).toMatchObject({ organization: "acme", status: "draft" });
    expect(ev?.domains).toEqual(["maria.exemplo.com", "outro.exemplo.com:3000 (primário)"]);
    expect(list[0]?.slug).toBe("dani-gustavo");
  });
});

describe("uploads:migrate", () => {
  it("move arquivos da raiz para 1/ e reescreve gifts.image, de forma idempotente", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uploads-"));
    try {
      await writeFile(join(dir, "abc.jpg"), "x");
      await mkdir(join(dir, "7"));
      await writeFile(join(dir, "7", "keep.jpg"), "y");
      const [g] = await db.select({ id: gifts.id }).from(gifts).orderBy(gifts.id);
      await db.update(gifts).set({ image: "/uploads/abc.jpg" }).where(eq(gifts.id, g!.id));

      expect(await migrateUploads(db, dir)).toEqual({ filesMoved: 1, giftsUpdated: 1 });
      expect(await readdir(join(dir, "1"))).toEqual(["abc.jpg"]);
      expect(await readdir(join(dir, "7"))).toEqual(["keep.jpg"]);
      const [after] = await db
        .select({ image: gifts.image })
        .from(gifts)
        .where(and(eq(gifts.id, g!.id), eq(gifts.eventId, 1)));
      expect(after?.image).toBe("/uploads/1/abc.jpg");

      expect(await migrateUploads(db, dir)).toEqual({ filesMoved: 0, giftsUpdated: 0 });
      expect(await migrateUploads(db, join(dir, "inexistente"))).toEqual({
        filesMoved: 0,
        giftsUpdated: 0,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
