import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import {
  assertEventSlug,
  createEventRecord,
  eventInitials,
  EventInputError,
  isEventHostAvailable,
  isEventSlugAvailable,
  normalizeEventHost,
} from "../src/event-service.ts";
import { runMigrations } from "../src/migrate.ts";
import { resetDatabase } from "../src/reset.ts";
import { eventSettings } from "../src/schema/app.ts";
import { eventDomains, events, organizations } from "../src/schema/tenancy.ts";
import { createTestDb } from "./helpers.ts";

let db: Database;
let orgId: number;
const STARTS = "2031-07-15T19:30:00-03:00";

beforeAll(async () => {
  db = await createTestDb();
  await resetDatabase(db);
  await runMigrations(db);
  const [res] = await db.insert(organizations).values({ slug: "org-svc", name: "Org do serviço" });
  orgId = res.insertId;
});

afterAll(async () => {
  await db.$client.end();
});

const base = (slug: string) => ({
  organizationId: orgId,
  slug,
  name: "Festa da Lia",
  type: "birthday",
  startsAt: STARTS,
});

async function failure(promise: Promise<unknown>): Promise<EventInputError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(EventInputError);
    return e as EventInputError;
  }
  throw new Error("Esperava EventInputError.");
}

describe("createEventRecord", () => {
  it("cria rascunho com as chaves neutras e o domínio primário", async () => {
    const out = await createEventRecord(db, { ...base("festa-lia"), host: " Lia.Exemplo.com " });
    expect(out).toMatchObject({ slug: "festa-lia", status: "draft", host: "lia.exemplo.com" });
    const [row] = await db.select().from(events).where(eq(events.id, out.id));
    expect(row).toMatchObject({ organizationId: orgId, type: "birthday", status: "draft" });
    expect(row!.startsAt!.toISOString()).toBe("2031-07-15T22:30:00.000Z");
    const keys = (await db.select().from(eventSettings).where(eq(eventSettings.eventId, out.id)))
      .map((r) => r.key)
      .sort();
    expect(keys).toEqual(
      ["couple.monogram", "couple.names", "wedding.datetime", "wedding.timezone"].sort(),
    );
    const [dom] = await db.select().from(eventDomains).where(eq(eventDomains.eventId, out.id));
    expect(dom).toMatchObject({ host: "lia.exemplo.com", isPrimary: true });
    expect(await isEventSlugAvailable(db, "festa-lia")).toBe(false);
    expect(await isEventHostAvailable(db, "lia.exemplo.com")).toBe(false);
  });

  it("slug e host repetidos: taken; nada fica gravado", async () => {
    const slug = await failure(createEventRecord(db, base("festa-lia")));
    expect(slug).toMatchObject({ field: "slug", reason: "taken" });
    const host = await failure(
      createEventRecord(db, { ...base("outra-festa"), host: "lia.exemplo.com" }),
    );
    expect(host).toMatchObject({ field: "host", reason: "taken" });
    expect(await isEventSlugAvailable(db, "outra-festa")).toBe(true);
  });

  it("entrada inválida: invalid, com o campo", async () => {
    const cases: [string, Parameters<typeof createEventRecord>[1]][] = [
      ["slug", base("Slug Ruim")],
      ["name", { ...base("ok-nome"), name: "  " }],
      ["type", { ...base("ok-tipo"), type: "x" }],
      ["status", { ...base("ok-status"), status: "x" }],
      ["startsAt", { ...base("ok-data"), startsAt: "2031-07-15T19:30:00" }],
      ["timezone", { ...base("ok-fuso"), timezone: "Marte/Olimpo" }],
      ["host", { ...base("ok-host"), host: "não é host" }],
    ];
    for (const [field, input] of cases) {
      expect(await failure(createEventRecord(db, input)), field).toMatchObject({
        field,
        reason: "invalid",
      });
    }
  });

  it("auxiliares", () => {
    expect(assertEventSlug("ana-e-bruno")).toBe("ana-e-bruno");
    expect(() => assertEventSlug("Ana")).toThrow(EventInputError);
    expect(normalizeEventHost(" Exemplo.COM ")).toBe("exemplo.com");
    expect(eventInitials("Ana e Bruno")).toBe("AB");
  });
});
