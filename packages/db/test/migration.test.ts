import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "../src/client.ts";
import { requireDatabaseUrl } from "../src/env.ts";
import { MIGRATIONS_FOLDER, runMigrations } from "../src/migrate.ts";

// Migrations 0006 (multi-evento), 0007 (sem DEFAULT em event_id) e 0008 (lados/mídia) sobre dados no
// formato antigo: banco temporário, aplica 0000–0005, insere um pouco de tudo, aplica o resto e
// confere que nada se perdeu.

const dbName = `casamento_mig_${ulid().toLowerCase()}`;
const serverUrl = new URL(requireDatabaseUrl());
serverUrl.pathname = "/";

let db: Database;
let oldFolder: string;

const q = async <T extends RowDataPacket = RowDataPacket>(sql: string, params: unknown[] = []) => {
  const [rows] = await db.$client.query<T[]>(sql, params);
  return rows;
};
const count = async (table: string) =>
  Number((await q<RowDataPacket>(`SELECT COUNT(*) AS n FROM \`${table}\``))[0]!.n);

const OLD_SETTINGS: [string, unknown, boolean][] = [
  ["couple.names", "Dani & Gustavo", true],
  ["wedding.datetime", "2027-04-10T16:00:00-03:00", true],
  ["wedding.timezone", "America/Sao_Paulo", true],
  ["ceremony.venue", { name: "Solare Roma", lat: null }, true],
  ["payments.card_fee_percent", 4.98, true],
  ["reminders", { enabled: true, daysBefore: [14, 3] }, false],
];

const TABLES = [
  "invitations",
  "guests",
  "rsvp_logs",
  "rsvp_reminders",
  "gifts",
  "gift_orders",
  "payments",
  "messages",
] as const;

const before: Record<string, number> = {};

beforeAll(async () => {
  const admin = await mysql.createConnection({ uri: serverUrl.toString() });
  await admin.query(
    `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.end();
  const url = new URL(serverUrl);
  url.pathname = `/${dbName}`;
  db = createDb(url.toString());

  // Pasta de migrations só até a 0005 (mesmos arquivos e hashes; journal cortado).
  oldFolder = mkdtempSync(join(tmpdir(), "casamento-mig-"));
  cpSync(MIGRATIONS_FOLDER, oldFolder, { recursive: true });
  const journalPath = join(oldFolder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  journal.entries = journal.entries.filter((e) => e.idx <= 5);
  expect(journal.entries.at(-1)?.tag).toBe("0005_lembretes_rsvp");
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(db, { migrationsFolder: oldFolder });

  // Dados no formato antigo (sem event_id, tabela settings).
  const now = new Date("2026-11-01T12:00:00.000Z");
  for (const [key, value, isPublic] of OLD_SETTINGS) {
    await q(
      "INSERT INTO settings (`key`, value, is_public, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [key, JSON.stringify(value), isPublic, now, now],
    );
  }
  for (const [i, token] of ["01JTESTE0000000000000000A1", "01JTESTE0000000000000000A2"].entries()) {
    await q(
      "INSERT INTO invitations (id, token, label, max_guests, side, created_at, updated_at) VALUES (?, ?, ?, 2, 'dani', ?, ?)",
      [i + 1, token, `Convite ${i + 1}`, now, now],
    );
    await q(
      "INSERT INTO guests (invitation_id, name, created_at, updated_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
      [i + 1, `Pessoa ${i}a`, now, now, i + 1, `Pessoa ${i}b`, now, now],
    );
  }
  await q("INSERT INTO rsvp_logs (invitation_id, payload, created_at) VALUES (1, '{}', ?)", [now]);
  await q("INSERT INTO rsvp_reminders (invitation_id, kind, created_at) VALUES (1, 'auto:14', ?)", [
    now,
  ]);
  await q(
    "INSERT INTO gifts (id, slug, title, price_cents, category, tile_design, created_at, updated_at) VALUES (1, 'air-fryer', 'Air fryer', 45000, 'casa', 'a', ?, ?)",
    [now, now],
  );
  await q(
    `INSERT INTO gift_orders (id, public_id, gift_id, amount_cents, buyer_name, buyer_email, status, expires_at, created_at, updated_at)
     VALUES (1, '01JTESTE0000000000000000P1', 1, 45000, 'Tia', 'tia@exemplo.com', 'paid', ?, ?, ?)`,
    [now, now, now],
  );
  await q(
    `INSERT INTO payments (order_id, gateway, gateway_id, method, gross_cents, net_cents, created_at, updated_at)
     VALUES (1, 'simulado', 'sim_1', 'pix', 45000, 45000, ?, ?)`,
    [now, now],
  );
  await q(
    "INSERT INTO messages (author, body, approved, gift_order_id, created_at, updated_at) VALUES ('Tia', 'Felicidades!', 1, 1, ?, ?), ('Primo', 'Oi', 0, NULL, ?, ?)",
    [now, now, now, now],
  );
  await q(
    "INSERT INTO webhook_events (gateway, event_id, payload, created_at) VALUES ('simulado', 'evt_1', '{}', ?)",
    [now],
  );
  for (const t of TABLES) before[t] = await count(t);

  await runMigrations(db);
});

afterAll(async () => {
  if (db) {
    await db.$client.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await db.$client.end();
  }
  if (oldFolder) rmSync(oldFolder, { recursive: true, force: true });
});

describe("migrations 0006 (multi-evento) e 0007", () => {
  it("cria a organização 1 e o evento 1 com dados lidos de settings", async () => {
    const [org] = await q("SELECT id, slug, name, status FROM organizations");
    expect(org).toMatchObject({ id: 1, slug: "org-1", name: "Organização 1", status: "active" });
    const evs = await q("SELECT * FROM events");
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      id: 1,
      organization_id: 1,
      slug: "dani-gustavo",
      type: "wedding",
      name: "Dani & Gustavo",
      status: "active",
      timezone: "America/Sao_Paulo",
    });
    // 16h em -03:00 = 19h UTC (o pool usa timezone "Z").
    expect((evs[0]!.starts_at as Date).toISOString()).toBe("2027-04-10T19:00:00.000Z");
  });

  it("mantém as contagens e põe event_id = 1 em todas as tabelas do evento", async () => {
    for (const t of TABLES) {
      expect(await count(t), t).toBe(before[t]);
      const [row] = await q(`SELECT COUNT(*) AS n FROM \`${t}\` WHERE event_id <> 1`);
      expect(Number(row!.n), t).toBe(0);
    }
    const [wh] = await q("SELECT app_event_id FROM webhook_events");
    expect(wh!.app_event_id).toBe(1);
  });

  it("copia settings para event_settings e apaga a tabela antiga", async () => {
    const rows = await q(
      // event.sides vem da 0008 (testada abaixo).
      "SELECT event_id, `key`, value, is_public FROM event_settings WHERE `key` <> 'event.sides' ORDER BY `key`",
    );
    expect(rows).toHaveLength(OLD_SETTINGS.length);
    for (const [key, value, isPublic] of OLD_SETTINGS) {
      const row = rows.find((r) => r.key === key);
      expect(row, key).toBeDefined();
      const v: unknown = typeof row!.value === "string" ? JSON.parse(row!.value) : row!.value;
      expect(v).toEqual(value);
      expect(Boolean(row!.is_public)).toBe(isPublic);
      expect(row!.event_id).toBe(1);
    }
    expect(await q("SHOW TABLES LIKE 'settings'")).toHaveLength(0);
  });

  it("aceita o mesmo slug de presente em outro evento, mas não no mesmo", async () => {
    await q(
      "INSERT INTO events (id, organization_id, slug, name, status, created_at, updated_at) VALUES (2, 1, 'outro', 'Outro', 'active', NOW(3), NOW(3))",
    );
    await q(
      "INSERT INTO gifts (event_id, slug, title, price_cents, category, tile_design, created_at, updated_at) VALUES (2, 'air-fryer', 'Air fryer', 100, 'casa', 'a', NOW(3), NOW(3))",
    );
    await expect(
      q(
        "INSERT INTO gifts (event_id, slug, title, price_cents, category, tile_design, created_at, updated_at) VALUES (1, 'air-fryer', 'De novo', 100, 'casa', 'a', NOW(3), NOW(3))",
      ),
    ).rejects.toThrow(/Duplicate/);
  });

  it("as FKs compostas impedem filho e pai de eventos diferentes", async () => {
    await expect(
      q(
        "INSERT INTO guests (event_id, invitation_id, name, created_at, updated_at) VALUES (2, 1, 'Intrusa', NOW(3), NOW(3))",
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      q(
        `INSERT INTO gift_orders (event_id, public_id, gift_id, amount_cents, buyer_name, buyer_email, expires_at, created_at, updated_at)
         VALUES (2, '01JTESTE0000000000000000P2', 1, 100, 'X', 'x@exemplo.com', NOW(3), NOW(3), NOW(3))`,
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      q(
        `INSERT INTO payments (event_id, order_id, gateway, gateway_id, method, gross_cents, net_cents, created_at, updated_at)
         VALUES (2, 1, 'simulado', 'sim_2', 'pix', 1, 1, NOW(3), NOW(3))`,
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("não deixa apagar evento com pedidos", async () => {
    await expect(q("DELETE FROM events WHERE id = 1")).rejects.toThrow(/foreign key/i);
  });

  it("0007: event_id não tem mais DEFAULT e insert sem ele falha", async () => {
    for (const t of TABLES) {
      const [col] = await q(
        `SELECT is_nullable, column_default FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'event_id'`,
        [t],
      );
      expect(col!.is_nullable, t).toBe("NO");
      expect(col!.column_default, t).toBeNull();
    }
    await expect(
      q(
        "INSERT INTO gifts (slug, title, price_cents, category, tile_design, created_at, updated_at) VALUES ('sem-evento', 'X', 100, 'casa', 'a', NOW(3), NOW(3))",
      ),
    ).rejects.toThrow(/event_id/);
    await expect(
      q(
        "INSERT INTO invitations (token, label, max_guests, side, created_at, updated_at) VALUES ('01JTESTE0000000000000SEMEV', 'X', 1, 'dani', NOW(3), NOW(3))",
      ),
    ).rejects.toThrow(/event_id/);
  });
});

describe("migration 0008 (conteúdo, temas e lados por evento)", () => {
  it("invitations.side vira varchar e os convites antigos mantêm o lado", async () => {
    const [col] = await q(
      `SELECT data_type, character_maximum_length AS len FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'invitations' AND column_name = 'side'`,
    );
    expect(String(col!.data_type).toLowerCase()).toBe("varchar");
    expect(Number(col!.len)).toBe(32);
    const sides = await q("SELECT DISTINCT side FROM invitations ORDER BY side");
    expect(sides.map((r) => r.side)).toEqual(["dani"]);
    // Lado de outro evento (chave livre) passa a ser aceito pelo banco.
    await q(
      "INSERT INTO invitations (event_id, token, label, max_guests, side, created_at, updated_at) VALUES (1, '01JTESTE0000000000000LADO1', 'X', 1, 'familia-noiva', NOW(3), NOW(3))",
    );
    await q("DELETE FROM invitations WHERE token = '01JTESTE0000000000000LADO1'");
  });

  it("grava os lados antigos em event.sides de cada evento (privado)", async () => {
    const [row] = await q(
      "SELECT value, is_public FROM event_settings WHERE event_id = 1 AND `key` = 'event.sides'",
    );
    const value = typeof row!.value === "string" ? JSON.parse(row!.value) : row!.value;
    expect(value).toEqual([
      { key: "dani", label: "Dani" },
      { key: "gustavo", label: "Gustavo" },
    ]);
    expect(Boolean(row!.is_public)).toBe(false);
  });

  it("cria event_media com arquivo único por evento", async () => {
    const insert = (file: string) =>
      q(
        "INSERT INTO event_media (event_id, file, mime, width, height, bytes, created_at, updated_at) VALUES (1, ?, 'image/jpeg', 800, 600, 1000, NOW(3), NOW(3))",
        [file],
      );
    await insert("01JTESTEFOTO.jpg");
    await expect(insert("01JTESTEFOTO.jpg")).rejects.toThrow(/duplicate/i);
    const [m] = await q("SELECT alt, caption, in_gallery, sort FROM event_media");
    expect(m).toMatchObject({ alt: "", caption: "", sort: 0 });
    expect(Boolean(m!.in_gallery)).toBe(true);
    await q("DELETE FROM event_media");
  });
});
