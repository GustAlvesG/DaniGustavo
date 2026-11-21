import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Database } from "../client.ts";
import { account, user } from "../schema/auth.ts";
import { eventMembers, events, organizationMembers, organizations } from "../schema/tenancy.ts";

/**
 * Anfitrião só dos e2e: usuário com papel `event_host` em um único evento de teste e a senha
 * dada (trocada a cada rodada, nunca fica fixa no código). Só para bancos de dev/teste.
 */
export async function ensureE2eHost(
  db: Database,
  input: { slug: string; email: string; name: string; password: string },
): Promise<{ eventId: number; userId: string }> {
  const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.slug, input.slug));
  if (!ev) throw new Error(`Evento ${input.slug} não existe.`);
  const email = input.email.trim().toLowerCase();
  const hash = await hashPassword(input.password);
  const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const userId = found?.id ?? ulid();
  if (!found) {
    await db.insert(user).values({ id: userId, name: input.name, email, emailVerified: true });
    await db.insert(account).values({
      id: ulid(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
    });
  } else {
    await db
      .update(account)
      .set({ password: hash })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  }
  await db.insert(eventMembers).ignore().values({ eventId: ev.id, userId, role: "host" });
  return { eventId: ev.id, userId };
}

/**
 * Organização só de um e2e (Fase 3), com um dono de senha dada: o fluxo criar evento → convidar
 * anfitrião roda nela, sem mudar o que o admin do seed vê (os outros e2e do painel contam com
 * um evento só). `cleanupE2eOrg` apaga tudo. Só para bancos de dev/teste.
 */
export async function ensureE2eOrg(
  db: Database,
  input: { slug: string; name: string; email: string; password: string },
): Promise<{ orgId: number; userId: string }> {
  const [res] = await db.insert(organizations).values({ slug: input.slug, name: input.name });
  const orgId = res.insertId;
  const userId = ulid();
  await db.insert(user).values({
    id: userId,
    name: "Dona E2E",
    email: input.email.toLowerCase(),
    emailVerified: true,
  });
  await db.insert(account).values({
    id: ulid(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(input.password),
  });
  await db.insert(organizationMembers).values({ organizationId: orgId, userId, role: "owner" });
  return { orgId, userId };
}

/**
 * Platform admin só de um e2e (Fase 6: telas do painel da plataforma), com a senha dada. Se o
 * e-mail já existe, a conta é recriada. Só para bancos de dev/teste.
 */
export async function ensureE2ePlatformAdmin(
  db: Database,
  input: { email: string; password: string },
): Promise<{ userId: string }> {
  const email = input.email.toLowerCase();
  await db.delete(user).where(eq(user.email, email));
  const userId = ulid();
  await db
    .insert(user)
    .values({ id: userId, name: "Admin E2E", email, emailVerified: true, platformRole: "admin" });
  await db.insert(account).values({
    id: ulid(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(input.password),
  });
  return { userId };
}

/** Apaga a organização do e2e, os eventos dela e as contas indicadas. */
export async function cleanupE2eOrg(db: Database, slug: string, emails: string[]): Promise<void> {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug));
  if (org) {
    await db.delete(events).where(eq(events.organizationId, org.id));
    await db.delete(organizations).where(eq(organizations.id, org.id));
  }
  for (const email of emails) await db.delete(user).where(eq(user.email, email.toLowerCase()));
}
