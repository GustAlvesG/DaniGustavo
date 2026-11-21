import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { runMigrations } from "../src/migrate.ts";
import { resetDatabase } from "../src/reset.ts";
import { eventSettings, gifts, guests, invitations } from "../src/schema/app.ts";
import { account, user } from "../src/schema/auth.ts";
import {
  eventDomains,
  events,
  LEGACY_EVENT_ID,
  organizationMembers,
} from "../src/schema/tenancy.ts";
import { seed, setup } from "../src/seed.ts";
import { createTestDb } from "./helpers.ts";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
// O seed importa o conteúdo do casamento (fotos para UPLOAD_DIR): pasta temporária nos testes.
const uploadDir = mkdtempSync(join(tmpdir(), "casamento-db-uploads-"));
const env = {
  UPLOAD_DIR: uploadDir,
  ADMIN_EMAIL_1: "teste1@exemplo.com",
  ADMIN_EMAIL_2: "teste2@exemplo.com",
  ADMIN_PASSWORD_INICIAL: "senha-de-teste-123",
};

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
  await resetDatabase(db);
  await runMigrations(db);
  await seed(db, env);
});

afterAll(async () => {
  rmSync(uploadDir, { recursive: true, force: true });
  await db?.$client.end();
});

describe("seed", () => {
  it("cria 5 convites e 8 presentes", async () => {
    const [inv] = await db.select({ n: count() }).from(invitations);
    const [gft] = await db.select({ n: count() }).from(gifts);
    expect(inv?.n).toBe(5);
    expect(gft?.n).toBe(8);
  });

  it("usa ULIDs aleatórios e únicos como token dos convites", async () => {
    const rows = await db.select({ token: invitations.token }).from(invitations);
    for (const r of rows) expect(r.token).toMatch(ULID);
    expect(new Set(rows.map((r) => r.token)).size).toBe(rows.length);
  });

  it("tem convite com +1 e convite com criança, dos dois lados", async () => {
    const rows = await db.select().from(invitations);
    expect(rows.some((r) => r.allowPlusOne)).toBe(true);
    expect(new Set(rows.map((r) => r.side))).toEqual(new Set(["dani", "gustavo"]));
    const kids = await db.select().from(guests).where(eq(guests.isChild, true));
    expect(kids.length).toBeGreaterThan(0);
  });

  it("lê JSON já convertido em objeto (MariaDB e MySQL)", async () => {
    const [row] = await db
      .select()
      .from(eventSettings)
      .where(
        and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "ceremony.venue")),
      );
    expect(row?.value).toEqual({
      name: "Solare Roma",
      address: "R. Papagaio, 1800 - Roma, Volta Redonda - RJ, 27257-770",
      lat: null,
      lng: null,
      time: "16h",
    });
  });

  it("lê JSON que é só uma string (MySQL 8 e MariaDB ≥ 10.5 marcam a coluna como JSON)", async () => {
    const [row] = await db
      .select()
      .from(eventSettings)
      .where(
        and(eq(eventSettings.eventId, LEGACY_EVENT_ID), eq(eventSettings.key, "wedding.datetime")),
      );
    expect(row?.value).toBe("2027-04-10T16:00:00-03:00");
  });

  it("cria os dois usuários do painel com conta de senha", async () => {
    const users = await db.select().from(user);
    expect(users.map((u) => u.email).sort()).toEqual([env.ADMIN_EMAIL_1, env.ADMIN_EMAIL_2]);
    const accounts = await db.select().from(account).where(eq(account.providerId, "credential"));
    expect(accounts).toHaveLength(2);
    expect(accounts.every((a) => a.password && a.password !== env.ADMIN_PASSWORD_INICIAL)).toBe(
      true,
    );
  });

  it("é idempotente", async () => {
    const again = await seed(db, env);
    expect(again).toEqual({
      invitationsCreated: 0,
      giftsCreated: 0,
      settingsCreated: 0,
      adminsCreated: 0,
      domainsCreated: 0,
      membersCreated: 0,
    });
  });

  it("tem o evento 1 ativo com os domínios de desenvolvimento", async () => {
    const [ev] = await db.select().from(events).where(eq(events.id, LEGACY_EVENT_ID));
    expect(ev).toMatchObject({ slug: "dani-gustavo", status: "active", organizationId: 1 });
    const domains = await db.select().from(eventDomains).orderBy(eventDomains.id);
    expect(domains.map((d) => [d.host, d.isPrimary, d.eventId])).toEqual([
      ["localhost:3000", true, LEGACY_EVENT_ID],
      ["evento1.localhost:3000", false, LEGACY_EVENT_ID],
    ]);
  });

  it("os dois usuários são donos da organização 1 e só o segundo é admin da plataforma", async () => {
    const members = await db
      .select({
        email: user.email,
        role: organizationMembers.role,
        platformRole: user.platformRole,
      })
      .from(organizationMembers)
      .innerJoin(user, eq(user.id, organizationMembers.userId))
      .orderBy(user.email);
    expect(members).toEqual([
      { email: env.ADMIN_EMAIL_1, role: "owner", platformRole: null },
      { email: env.ADMIN_EMAIL_2, role: "owner", platformRole: "admin" },
    ]);
  });
});

describe("setup (produção)", () => {
  const prodEnv = { ...env, SITE_URL: "https://danigustavo.exemplo.com.br" };

  // Banco vazio para o setup. Fica no beforeAll (hookTimeout de 90 s): as migrations em
  // MariaDB são DDL com fsync, ~11 s sozinhas e mais que os 30 s de um teste quando a suíte da
  // API usa o mesmo servidor em paralelo (medido: reset ~1 s, migrations ~11 s, setup ~0,6 s).
  beforeAll(async () => {
    await resetDatabase(db);
    await runMigrations(db);
  });

  it("cria evento 1, configurações, admins, vínculos e o domínio de SITE_URL, sem dados fictícios", async () => {
    const first = await setup(db, prodEnv);
    expect(first.adminsCreated).toBe(2);
    expect(first.membersCreated).toBe(2);
    expect(first.domainsCreated).toBe(1);
    expect(first.settingsCreated).toBeGreaterThan(0);
    const [inv] = await db.select({ n: count() }).from(invitations);
    const [gft] = await db.select({ n: count() }).from(gifts);
    expect(inv?.n).toBe(0);
    expect(gft?.n).toBe(0);
    const [ev] = await db.select().from(events).where(eq(events.id, LEGACY_EVENT_ID));
    expect(ev).toMatchObject({ slug: "dani-gustavo", status: "active" });
    const domains = await db.select().from(eventDomains);
    expect(domains.map((d) => [d.host, d.isPrimary, d.eventId])).toEqual([
      ["danigustavo.exemplo.com.br", true, LEGACY_EVENT_ID],
    ]);
    expect(await setup(db, prodEnv)).toEqual({
      settingsCreated: 0,
      adminsCreated: 0,
      domainsCreated: 0,
      membersCreated: 0,
    });
  });

  it("não mexe nos domínios se o evento 1 já tiver algum", async () => {
    const r = await setup(db, { ...prodEnv, SITE_URL: "https://outro.exemplo.com.br" });
    expect(r.domainsCreated).toBe(0);
    const domains = await db.select({ host: eventDomains.host }).from(eventDomains);
    expect(domains).toEqual([{ host: "danigustavo.exemplo.com.br" }]);
  });
});
