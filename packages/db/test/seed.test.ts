import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { runMigrations } from "../src/migrate.ts";
import { resetDatabase } from "../src/reset.ts";
import { gifts, guests, invitations, settings } from "../src/schema/app.ts";
import { account, user } from "../src/schema/auth.ts";
import { seed } from "../src/seed.ts";
import { createTestDb } from "./helpers.ts";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const env = {
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
    const [row] = await db.select().from(settings).where(eq(settings.key, "ceremony.venue"));
    expect(row?.value).toEqual({
      name: "Local a definir",
      address: "",
      lat: null,
      lng: null,
      time: "",
    });
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
    });
  });
});
