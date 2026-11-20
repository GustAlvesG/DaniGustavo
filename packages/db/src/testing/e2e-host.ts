import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Database } from "../client.ts";
import { account, user } from "../schema/auth.ts";
import { eventMembers, events } from "../schema/tenancy.ts";

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
