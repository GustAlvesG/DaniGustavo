import {
  account,
  and,
  createDb,
  eventDomains,
  eventMembers,
  eventSettings,
  events,
  giftOrders,
  eq,
  inArray,
  LEGACY_EVENT_ID,
  loadRootEnv,
  messages,
  organizationMembers,
  organizations,
  payments,
  sql,
  user,
  type Database,
} from "@casamento/db";
import { hashPassword } from "better-auth/crypto";
import { ulid } from "ulid";
import { createApp, type App, type AppDeps } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { parseEnv } from "../src/env.ts";
import type { EventCtx } from "../src/tenancy/types.ts";
import { sqlAuditLogger } from "./sql-audit.ts";
import { apiTestDatabaseUrl } from "./test-database.ts";

export const TEST_WEB_KEY = "chave-de-teste-com-mais-de-32-caracteres";

/** Ambiente válido de teste; o banco é o dedicado da suíte (criado no global-setup), nunca o de dev. */
export function testEnv(extra: Record<string, string> = {}) {
  loadRootEnv();
  return parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: apiTestDatabaseUrl(),
    API_URL: "http://localhost:3333",
    WEB_KEY: TEST_WEB_KEY,
    BETTER_AUTH_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
    BETTER_AUTH_URL: "http://localhost:3333",
    ...extra,
  });
}

/** Banco de teste com o auditor de escopo (test/sql-audit.ts) ligado. */
export function testDb(url = testEnv().DATABASE_URL): Database {
  return createDb(url, { logger: sqlAuditLogger });
}

export function testApp(overrides: Partial<AppDeps> = {}, extraEnv: Record<string, string> = {}) {
  const env = testEnv(extraEnv);
  const db = testDb(env.DATABASE_URL);
  const app = createApp({ env, db, auth: createAuth(env, db), ...overrides });
  return { app, db, env };
}

// ---------------------------------------------------------------------------------------------
// Fixture multi-evento: org A (evento A) e org B (evento B), com um usuário para cada papel.

export const TEST_PASSWORD = "senha-de-teste-123";

export const TEST_USER_KINDS = ["host", "owner", "member", "stranger", "platformAdmin"] as const;
export type TestUserKind = (typeof TEST_USER_KINDS)[number];

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

export interface TestEvents {
  run: string;
  orgA: { id: number; slug: string };
  orgB: { id: number; slug: string };
  /** Ativo, com domínio primário `primaryHostA` e um secundário `secondaryHostA`. */
  eventA: EventCtx;
  /** Ativo, sem domínio. */
  eventB: EventCtx;
  /** Rascunho na org A (para testar 404 público). */
  draftA: EventCtx;
  primaryHostA: string;
  secondaryHostA: string;
  /**
   * host: event_members do evento A · owner/member: organization_members da org A ·
   * stranger: owner da org B (sem nada na A) · platformAdmin: platform_role = admin.
   */
  users: Record<TestUserKind, TestUser>;
  /** Faz login (IP próprio por chamada, para não esbarrar no limite de 5/min) e devolve o cookie. */
  login(app: App, kind: TestUserKind): Promise<string>;
  /** Apaga tudo o que a fixture criou (e pedidos/pagamentos dos eventos, que têm FK restrict). */
  cleanup(): Promise<void>;
}

let loginSeq = 0;

/*
 * Os arquivos de teste rodam em paralelo no mesmo banco e os eventos de cada um têm ids vizinhos:
 * um `DELETE ... WHERE event_id IN (...)` (e as cascatas) trava intervalos do índice que outro
 * arquivo está usando, e o InnoDB às vezes derruba um dos dois com deadlock (1213) ou estoura a
 * espera do lock (1205). No afterAll isso falhava o arquivo inteiro sem teste vermelho
 * (isolation*.test.ts). O InnoDB pede exatamente isto: repetir a instrução.
 */
export async function retryOnDeadlock<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const code =
        (err as { cause?: { errno?: number }; errno?: number }).cause?.errno ??
        (err as { errno?: number }).errno;
      if (i >= tries || (code !== 1213 && code !== 1205)) throw err;
      await new Promise((r) => setTimeout(r, 50 * i + Math.random() * 100));
    }
  }
}

export async function createTestEvents(db: Database): Promise<TestEvents> {
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const org = async (suffix: string) => {
    const slug = `t-org-${suffix}-${run}`;
    const [res] = await db.insert(organizations).values({ slug, name: `Org ${suffix} ${run}` });
    return { id: res.insertId, slug };
  };
  const orgA = await org("a");
  const orgB = await org("b");

  const event = async (
    orgId: number,
    suffix: string,
    status: EventCtx["status"],
  ): Promise<EventCtx> => {
    const values = {
      organizationId: orgId,
      slug: `t-ev-${suffix}-${run}`,
      type: "wedding",
      name: `Evento ${suffix.toUpperCase()} ${run}`,
      status,
      timezone: "America/Sao_Paulo",
      startsAt: new Date("2030-01-01T15:00:00Z"),
    };
    const [res] = await db.insert(events).values(values);
    return {
      id: res.insertId,
      slug: values.slug,
      orgId,
      timezone: values.timezone,
      name: values.name,
      type: values.type,
      status,
      startsAt: values.startsAt,
    };
  };
  const eventA = await event(orgA.id, "a", "active");
  const eventB = await event(orgB.id, "b", "active");
  const draftA = await event(orgA.id, "rascunho", "draft");

  const primaryHostA = `a-${run}.teste.local:3000`;
  const secondaryHostA = `www.a-${run}.teste.local`;
  await db.insert(eventDomains).values([
    { eventId: eventA.id, host: primaryHostA, isPrimary: true },
    { eventId: eventA.id, host: secondaryHostA, isPrimary: false },
  ]);

  const passwordHash = await hashPassword(TEST_PASSWORD);
  const users = {} as Record<TestUserKind, TestUser>;
  for (const kind of TEST_USER_KINDS) {
    const id = ulid();
    const u = { id, email: `${kind.toLowerCase()}-${run}@exemplo.com`, name: `Teste ${kind}` };
    await db.insert(user).values({
      ...u,
      emailVerified: true,
      platformRole: kind === "platformAdmin" ? "admin" : null,
    });
    await db.insert(account).values({
      id: ulid(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
    });
    users[kind] = u;
  }
  await db.insert(eventMembers).values({ eventId: eventA.id, userId: users.host.id, role: "host" });
  await db.insert(organizationMembers).values([
    { organizationId: orgA.id, userId: users.owner.id, role: "owner" },
    { organizationId: orgA.id, userId: users.member.id, role: "member" },
    { organizationId: orgB.id, userId: users.stranger.id, role: "owner" },
  ]);

  const eventIds = [eventA.id, eventB.id, draftA.id];

  return {
    run,
    orgA,
    orgB,
    eventA,
    eventB,
    draftA,
    primaryHostA,
    secondaryHostA,
    users,
    async login(app, kind) {
      loginSeq += 1;
      const res = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `203.0.113.${(process.pid + loginSeq) % 250}`,
        },
        body: JSON.stringify({ email: users[kind].email, password: TEST_PASSWORD }),
      });
      if (res.status !== 200) throw new Error(`Login de ${kind} falhou: ${res.status}`);
      return res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    },
    async cleanup() {
      // recados, payments e gift_orders (FK restrict) para events: saem antes (o resto vai em cascata).
      await retryOnDeadlock(() => db.delete(messages).where(inArray(messages.eventId, eventIds)));
      await retryOnDeadlock(() => db.delete(payments).where(inArray(payments.eventId, eventIds)));
      await retryOnDeadlock(() =>
        db.delete(giftOrders).where(inArray(giftOrders.eventId, eventIds)),
      );
      await retryOnDeadlock(() => db.delete(events).where(inArray(events.id, eventIds)));
      await retryOnDeadlock(() =>
        db.delete(organizations).where(inArray(organizations.id, [orgA.id, orgB.id])),
      );
      const userIds = Object.values(users).map((u) => u.id);
      await retryOnDeadlock(() => db.delete(user).where(inArray(user.id, userIds)));
    },
  };
}

/** Grava (ou troca) uma configuração do evento; para montar o cenário de um teste. */
export async function setEventSetting(
  db: Database,
  eventId: number,
  key: string,
  value: unknown,
  isPublic = true,
) {
  await db
    .insert(eventSettings)
    .values({ eventId, key, value, isPublic })
    .onDuplicateKeyUpdate({ set: { value, isPublic } });
}

/**
 * Configurações do evento 1 para copiar como base de um evento de teste (conteúdo público válido).
 * Ficam de fora as chaves que outros arquivos de teste gravam no evento 1 enquanto rodam em
 * paralelo (hoje só "reminders", de reminders.test.ts): copiá-las faria o evento novo herdar
 * um estado transitório de outro arquivo, conforme a ordem em que os workers chegam ao banco.
 */
export async function legacySettingsBase(db: Database) {
  return db
    .select()
    .from(eventSettings)
    .where(
      and(eq(eventSettings.eventId, LEGACY_EVENT_ID), sql`${eventSettings.key} <> ${"reminders"}`),
    );
}
