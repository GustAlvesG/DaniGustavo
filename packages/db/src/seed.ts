import { hashPassword } from "better-auth/crypto";
import { count, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Database } from "./client.ts";
import { newPublicId } from "./ids.ts";
import { gifts, guests, invitations, settings } from "./schema/app.ts";
import { account, user } from "./schema/auth.ts";
import { ADMIN_NAMES, seedGifts, seedInvitations, seedSettings } from "./seed-data.ts";

export interface SeedResult {
  invitationsCreated: number;
  giftsCreated: number;
  settingsCreated: number;
  adminsCreated: number;
}

/** Popula o banco com dados fictícios. Idempotente: não duplica nem sobrescreve o que já existe. */
export async function seed(
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeedResult> {
  const result: SeedResult = {
    invitationsCreated: 0,
    giftsCreated: 0,
    settingsCreated: 0,
    adminsCreated: 0,
  };

  for (const s of seedSettings) {
    // INSERT IGNORE: affectedRows = 1 quando inseriu, 0 quando a chave já existia.
    const [res] = await db
      .insert(settings)
      .ignore()
      .values({ key: s.key, value: s.value, isPublic: s.isPublic });
    if (res.affectedRows === 1) result.settingsCreated++;
  }

  for (const [i, g] of seedGifts.entries()) {
    const [res] = await db
      .insert(gifts)
      .ignore()
      .values({ ...g, openAmount: g.openAmount ?? false, sort: (i + 1) * 10 });
    if (res.affectedRows === 1) result.giftsCreated++;
  }

  const [existing] = await db.select({ n: count() }).from(invitations);
  if ((existing?.n ?? 0) === 0) {
    for (const inv of seedInvitations) {
      await db.transaction(async (tx) => {
        const [res] = await tx.insert(invitations).values({
          token: newPublicId(),
          label: inv.label,
          side: inv.side,
          maxGuests: inv.maxGuests,
          allowPlusOne: inv.allowPlusOne,
        });
        await tx.insert(guests).values(
          inv.guests.map((g) => ({
            invitationId: res.insertId,
            name: g.name,
            isChild: g.isChild ?? false,
            ageRange: g.ageRange ?? null,
            rsvpStatus: g.rsvpStatus ?? "pending",
            dietaryNotes: g.dietaryNotes ?? null,
            phone: g.phone ?? null,
            email: g.email ?? null,
            respondedAt: g.rsvpStatus && g.rsvpStatus !== "pending" ? new Date() : null,
          })),
        );
      });
      result.invitationsCreated++;
    }
  }

  result.adminsCreated = await seedAdmins(db, env);
  return result;
}

/** Convites com token e convidados, para testar manualmente (links /c/<token>). */
export async function listInvitationTokens(
  db: Database,
): Promise<{ label: string; token: string; guests: string[] }[]> {
  const rows = await db
    .select({ label: invitations.label, token: invitations.token, name: guests.name })
    .from(invitations)
    .innerJoin(guests, eq(guests.invitationId, invitations.id))
    .orderBy(invitations.id, guests.id);
  const byToken = new Map<string, { label: string; token: string; guests: string[] }>();
  for (const r of rows) {
    const entry = byToken.get(r.token) ?? { label: r.label, token: r.token, guests: [] };
    entry.guests.push(r.name);
    byToken.set(r.token, entry);
  }
  return [...byToken.values()];
}

/** Cria os dois usuários do painel (e-mails do .env) com a senha inicial, se ainda não existirem. */
export async function seedAdmins(db: Database, env: NodeJS.ProcessEnv): Promise<number> {
  const emails = [env.ADMIN_EMAIL_1, env.ADMIN_EMAIL_2];
  const password = env.ADMIN_PASSWORD_INICIAL;
  if (!password || emails.some((e) => !e)) {
    console.warn(
      "Usuários do painel não criados: defina ADMIN_EMAIL_1, ADMIN_EMAIL_2 e ADMIN_PASSWORD_INICIAL no .env e rode o seed de novo.",
    );
    return 0;
  }

  let created = 0;
  for (const [i, rawEmail] of emails.entries()) {
    const email = rawEmail!.trim().toLowerCase();
    const found = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (found.length > 0) continue;

    const userId = ulid();
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: ADMIN_NAMES[i] ?? email,
        email,
        emailVerified: true,
      });
      // Conta "credential" é a que o Better Auth usa no login por e-mail e senha.
      await tx.insert(account).values({
        id: ulid(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hash,
      });
    });
    created++;
  }
  return created;
}
