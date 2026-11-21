import {
  PAYMENT_ACCOUNT_HOLDERS as SHARED_HOLDERS,
  PAYMENT_ACCOUNT_PERSON_TYPES as SHARED_PERSON_TYPES,
  PAYMENT_ACCOUNT_STATUSES as SHARED_STATUSES,
  PAYMENT_RECEIVERS as SHARED_RECEIVERS,
} from "@casamento/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client.ts";
import { runMigrations } from "../src/migrate.ts";
import { resetDatabase } from "../src/reset.ts";
import {
  events,
  LEGACY_EVENT_ID,
  organizations,
  PAYMENT_ACCOUNT_HOLDERS,
  PAYMENT_ACCOUNT_PERSON_TYPES,
  PAYMENT_ACCOUNT_STATUSES,
  PAYMENT_RECEIVERS,
  paymentAccounts,
} from "../src/schema/tenancy.ts";
import { createTestDb } from "./helpers.ts";

// Fase 5 (migration 0011): eventos existentes continuam na conta da plataforma, eventos novos
// nascem recebendo pela organização e a FK composta impede escolher conta de outra organização.

let db: Database;
const ids = { orgA: 0, orgB: 0, eventA: 0, accountA: 0, accountB: 0 };

const account = async (organizationId: number, publicId: string) =>
  (
    await db.insert(paymentAccounts).values({
      organizationId,
      holder: "organization",
      provider: "simulado",
      publicId,
      personType: "company",
      name: publicId,
      email: `${publicId.toLowerCase()}@exemplo.com`,
      documentHint: "••.•••.•••/0001-91",
    })
  )[0].insertId;

beforeAll(async () => {
  db = await createTestDb();
  await resetDatabase(db);
  await runMigrations(db);
  const org = async (slug: string) =>
    (await db.insert(organizations).values({ slug, name: slug }))[0].insertId;
  ids.orgA = await org("rec-a");
  ids.orgB = await org("rec-b");
  ids.eventA = (
    await db.insert(events).values({ organizationId: ids.orgA, slug: "rec-evento-a", name: "A" })
  )[0].insertId;
  ids.accountA = await account(ids.orgA, "01RECEBIMENTOSA0000000000A");
  ids.accountB = await account(ids.orgB, "01RECEBIMENTOSB0000000000B");
});

afterAll(async () => {
  await db.$client.end();
});

describe("listas da fase 5", () => {
  it("as do schema = as de @casamento/shared", () => {
    expect([...PAYMENT_RECEIVERS]).toEqual([...SHARED_RECEIVERS]);
    expect([...PAYMENT_ACCOUNT_HOLDERS]).toEqual([...SHARED_HOLDERS]);
    expect([...PAYMENT_ACCOUNT_PERSON_TYPES]).toEqual([...SHARED_PERSON_TYPES]);
    expect([...PAYMENT_ACCOUNT_STATUSES]).toEqual([...SHARED_STATUSES]);
  });
});

describe("recebedor do evento", () => {
  it("o evento 1 (anterior à fase 5) recebe pela plataforma; evento novo, pela organização", async () => {
    const [legacy] = await db
      .select({ receiver: events.paymentReceiver })
      .from(events)
      .where(eq(events.id, LEGACY_EVENT_ID));
    expect(legacy?.receiver).toBe("platform");
    const [fresh] = await db
      .select({ receiver: events.paymentReceiver, account: events.receivingAccountId })
      .from(events)
      .where(eq(events.id, ids.eventA));
    expect(fresh).toEqual({ receiver: "organization", account: null });
  });

  it("aceita conta da mesma organização e recusa a de outra (FK composta)", async () => {
    await db
      .update(events)
      .set({ paymentReceiver: "host", receivingAccountId: ids.accountA })
      .where(eq(events.id, ids.eventA));
    await expect(
      db.update(events).set({ receivingAccountId: ids.accountB }).where(eq(events.id, ids.eventA)),
    ).rejects.toThrow();
  });

  it("conta escolhida por um evento não se apaga (restrict)", async () => {
    await expect(
      db.delete(paymentAccounts).where(eq(paymentAccounts.id, ids.accountA)),
    ).rejects.toThrow();
  });
});
