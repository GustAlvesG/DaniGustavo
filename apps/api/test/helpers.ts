import {
  account,
  createDb,
  eventDomains,
  eventMembers,
  events,
  giftOrders,
  inArray,
  loadRootEnv,
  messages,
  organizationMembers,
  organizations,
  payments,
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

export const TEST_WEB_KEY = "chave-de-teste-com-mais-de-32-caracteres";

/** Ambiente válido de teste; DATABASE_URL vem do .env/CI (o pool só conecta na primeira query). */
export function testEnv(extra: Record<string, string> = {}) {
  loadRootEnv();
  return parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL ?? "mysql://root:@127.0.0.1:3306/casamento",
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
      await db.delete(messages).where(inArray(messages.eventId, eventIds));
      await db.delete(payments).where(inArray(payments.eventId, eventIds));
      await db.delete(giftOrders).where(inArray(giftOrders.eventId, eventIds));
      await db.delete(events).where(inArray(events.id, eventIds));
      await db.delete(organizations).where(inArray(organizations.id, [orgA.id, orgB.id]));
      const userIds = Object.values(users).map((u) => u.id);
      await db.delete(user).where(inArray(user.id, userIds));
    },
  };
}
