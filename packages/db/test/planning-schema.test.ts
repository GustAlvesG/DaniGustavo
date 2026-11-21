import {
  EVENT_VENDOR_STATUSES as SHARED_EVENT_VENDOR_STATUSES,
  QUOTE_STATUSES as SHARED_QUOTE_STATUSES,
  TASK_STATUSES as SHARED_TASK_STATUSES,
} from "@casamento/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { runMigrations } from "../src/migrate.ts";
import { resetDatabase } from "../src/reset.ts";
import {
  EVENT_VENDOR_STATUSES,
  eventVendors,
  QUOTE_STATUSES,
  quoteItems,
  quotes,
  TASK_STATUSES,
  taskTemplateItems,
  taskTemplates,
  vendors,
} from "../src/schema/planning.ts";
import { events, organizations } from "../src/schema/tenancy.ts";
import { createTestDb } from "./helpers.ts";

// Fase 4 (migration 0010): as FKs compostas garantem no banco que fornecedor e evento são da
// mesma organização e que filhos (itens, parcelas, contratos) ficam no evento do pai.

let db: Database;
const ids = { orgA: 0, orgB: 0, eventA: 0, eventB: 0, vendorA: 0, vendorB: 0 };

beforeAll(async () => {
  db = await createTestDb();
  await resetDatabase(db);
  await runMigrations(db);
  const org = async (slug: string) =>
    (await db.insert(organizations).values({ slug, name: slug }))[0].insertId;
  ids.orgA = await org("plan-a");
  ids.orgB = await org("plan-b");
  const event = async (organizationId: number, slug: string) =>
    (await db.insert(events).values({ organizationId, slug, name: slug }))[0].insertId;
  ids.eventA = await event(ids.orgA, "plan-evento-a");
  ids.eventB = await event(ids.orgB, "plan-evento-b");
  const vendor = async (organizationId: number, name: string) =>
    (await db.insert(vendors).values({ organizationId, name, category: "buffet" }))[0].insertId;
  ids.vendorA = await vendor(ids.orgA, "Buffet A");
  ids.vendorB = await vendor(ids.orgB, "Buffet B");
});

afterAll(async () => {
  await db.$client.end();
});

describe("listas da fase 4", () => {
  it("status do schema = os de @casamento/shared", () => {
    expect([...TASK_STATUSES]).toEqual([...SHARED_TASK_STATUSES]);
    expect([...EVENT_VENDOR_STATUSES]).toEqual([...SHARED_EVENT_VENDOR_STATUSES]);
    expect([...QUOTE_STATUSES]).toEqual([...SHARED_QUOTE_STATUSES]);
  });
});

describe("FKs compostas", () => {
  it("liga fornecedor da própria organização ao evento", async () => {
    const [res] = await db.insert(eventVendors).values({
      eventId: ids.eventA,
      organizationId: ids.orgA,
      vendorId: ids.vendorA,
      category: "buffet",
    });
    expect(res.insertId).toBeGreaterThan(0);
  });

  it("recusa fornecedor de outra organização e organização errada do evento", async () => {
    await expect(
      db.insert(eventVendors).values({
        eventId: ids.eventA,
        organizationId: ids.orgA,
        vendorId: ids.vendorB,
        category: "buffet",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(eventVendors).values({
        eventId: ids.eventA,
        organizationId: ids.orgB,
        vendorId: ids.vendorB,
        category: "buffet",
      }),
    ).rejects.toThrow();
  });

  it("item de orçamento fica no evento do orçamento", async () => {
    const [link] = await db.insert(eventVendors).values({
      eventId: ids.eventB,
      organizationId: ids.orgB,
      vendorId: ids.vendorB,
      category: "buffet",
    });
    const [quote] = await db.insert(quotes).values({
      eventId: ids.eventB,
      eventVendorId: link.insertId,
      title: "Q",
      category: "buffet",
    });
    await expect(
      db.insert(quoteItems).values({
        eventId: ids.eventA,
        quoteId: quote.insertId,
        description: "x",
        unitCents: 100,
      }),
    ).rejects.toThrow();
    const [ok] = await db.insert(quoteItems).values({
      eventId: ids.eventB,
      quoteId: quote.insertId,
      description: "Jantar",
      quantity: 100,
      unitCents: 15000,
    });
    expect(ok.insertId).toBeGreaterThan(0);
  });

  it("item de modelo fica na organização do modelo", async () => {
    const [tpl] = await db
      .insert(taskTemplates)
      .values({ organizationId: ids.orgA, name: "Casamento" });
    await expect(
      db.insert(taskTemplateItems).values({
        organizationId: ids.orgB,
        templateId: tpl.insertId,
        title: "x",
        category: "geral",
        offsetDays: -90,
      }),
    ).rejects.toThrow();
  });

  it("fornecedor usado em evento não se apaga", async () => {
    await expect(db.delete(vendors).where(eq(vendors.id, ids.vendorA))).rejects.toThrow();
  });
});
