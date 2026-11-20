import { hashPassword } from "better-auth/crypto";
import { count, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import type { Database } from "./client.ts";
import { newPublicId } from "./ids.ts";
import { importLegacyContent } from "./legacy/import.ts";
import { eventSettings, gifts, guests, invitations } from "./schema/app.ts";
import { account, user } from "./schema/auth.ts";
import {
  eventDomains,
  events,
  LEGACY_EVENT_ID,
  organizationMembers,
  organizations,
} from "./schema/tenancy.ts";
import { ADMIN_NAMES, seedGifts, seedInvitations, seedSettings } from "./seed-data.ts";

/** Organização do casamento (criada também pela migration 0006). */
const LEGACY_ORG_ID = 1;

/** Hosts de desenvolvimento do evento 1; o primeiro é o primário. */
export const DEV_EVENT_HOSTS = ["localhost:3000", "evento1.localhost:3000"] as const;

export interface SeedResult {
  invitationsCreated: number;
  giftsCreated: number;
  settingsCreated: number;
  adminsCreated: number;
  domainsCreated: number;
  membersCreated: number;
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
    domainsCreated: 0,
    membersCreated: 0,
  };

  await seedLegacyEvent(db);
  result.domainsCreated = await seedDevDomains(db);
  result.settingsCreated = await insertSettings(db);
  // Fotos, textos e galeria do casamento vêm do banco (Fase 2): sem isto o site do evento 1 fica nu.
  await importLegacyContent(db, { uploadDir: env.UPLOAD_DIR || undefined });

  for (const [i, g] of seedGifts.entries()) {
    const [res] = await db
      .insert(gifts)
      .ignore()
      .values({
        ...g,
        eventId: LEGACY_EVENT_ID,
        openAmount: g.openAmount ?? false,
        sort: (i + 1) * 10,
      });
    if (res.affectedRows === 1) result.giftsCreated++;
  }

  const [existing] = await db
    .select({ n: count() })
    .from(invitations)
    .where(eq(invitations.eventId, LEGACY_EVENT_ID));
  if ((existing?.n ?? 0) === 0) {
    for (const inv of seedInvitations) {
      await db.transaction(async (tx) => {
        const [res] = await tx.insert(invitations).values({
          eventId: LEGACY_EVENT_ID,
          token: newPublicId(),
          label: inv.label,
          side: inv.side,
          maxGuests: inv.maxGuests,
          allowPlusOne: inv.allowPlusOne,
        });
        await tx.insert(guests).values(
          inv.guests.map((g) => ({
            eventId: LEGACY_EVENT_ID,
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
  result.membersCreated = await seedMembers(db, env);
  return result;
}

/**
 * Organização 1 e evento 1. A migration 0006 já os cria (com os dados de `settings`); aqui é só
 * garantia para bancos montados de outro jeito. INSERT IGNORE não mexe no que já existe.
 */
async function seedLegacyEvent(db: Database): Promise<void> {
  await db
    .insert(organizations)
    .ignore()
    .values({ id: LEGACY_ORG_ID, slug: "org-1", name: "Organização 1", status: "active" });
  await db
    .insert(events)
    .ignore()
    .values({
      id: LEGACY_EVENT_ID,
      organizationId: LEGACY_ORG_ID,
      slug: "dani-gustavo",
      type: "wedding",
      name: "Dani & Gustavo",
      status: "active",
      timezone: "America/Sao_Paulo",
      startsAt: new Date("2027-04-10T16:00:00-03:00"),
    });
}

/** Domínios de desenvolvimento do evento 1 (em produção, cadastrados pela CLI). */
async function seedDevDomains(db: Database): Promise<number> {
  let created = 0;
  for (const [i, host] of DEV_EVENT_HOSTS.entries()) {
    const [res] = await db
      .insert(eventDomains)
      .ignore()
      .values({ eventId: LEGACY_EVENT_ID, host, isPrimary: i === 0 });
    if (res.affectedRows === 1) created++;
  }
  return created;
}

/** Configurações iniciais do evento 1 (textos, datas, locais): só as chaves que ainda não existem. */
async function insertSettings(db: Database): Promise<number> {
  let created = 0;
  for (const s of seedSettings) {
    // INSERT IGNORE: affectedRows = 1 quando inseriu, 0 quando a chave já existia.
    const [res] = await db
      .insert(eventSettings)
      .ignore()
      .values({ eventId: LEGACY_EVENT_ID, key: s.key, value: s.value, isPublic: s.isPublic });
    if (res.affectedRows === 1) created++;
  }
  return created;
}

/**
 * Papéis dos usuários do painel. TODO(fase1-papeis): provisório até o casal decidir; hoje os
 * dois são donos da organização 1 e o Gustavo (dev, ADMIN_NAMES[1]) é admin da plataforma.
 */
async function seedMembers(db: Database, env: NodeJS.ProcessEnv): Promise<number> {
  const emails = [env.ADMIN_EMAIL_1, env.ADMIN_EMAIL_2]
    .filter((e): e is string => Boolean(e))
    .map((e) => e.trim().toLowerCase());
  if (emails.length === 0) return 0;

  const users = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.email, emails));
  let created = 0;
  for (const u of users) {
    const [res] = await db
      .insert(organizationMembers)
      .ignore()
      .values({ organizationId: LEGACY_ORG_ID, userId: u.id, role: "owner" });
    if (res.affectedRows === 1) created++;
  }

  const platformAdmin = env.ADMIN_EMAIL_2?.trim().toLowerCase();
  if (platformAdmin) {
    await db.update(user).set({ platformRole: "admin" }).where(eq(user.email, platformAdmin));
  }
  return created;
}

export interface SetupResult {
  settingsCreated: number;
  adminsCreated: number;
  domainsCreated: number;
  membersCreated: number;
}

/**
 * Host de SITE_URL (com a porta, se não for a padrão), como fica em `event_domains.host`.
 * Vazio/inválido → null.
 */
export function hostFromSiteUrl(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  try {
    return new URL(siteUrl).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Primeira carga em produção (e também depois das migrations da plataforma num banco que já
 * existia): organização/evento 1, as configurações (o site e a API não sobem sem elas; os
 * textos provisórios se editam no painel), os dois usuários do painel com os vínculos à
 * organização 1 e o host de SITE_URL como domínio primário do evento 1, se o evento ainda não
 * tiver nenhum (sem domínio, o site responde 404). Diferente do `seed`, não cria convites,
 * presentes nem os domínios de desenvolvimento. Idempotente: não sobrescreve nada que já exista.
 */
export async function setup(
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SetupResult> {
  await seedLegacyEvent(db);
  const settingsCreated = await insertSettings(db);
  await importLegacyContent(db, { uploadDir: env.UPLOAD_DIR || undefined });
  const adminsCreated = await seedAdmins(db, env);
  const membersCreated = await seedMembers(db, env);
  let domainsCreated = 0;
  const host = hostFromSiteUrl(env.SITE_URL);
  if (host) {
    const [existing] = await db
      .select({ n: count() })
      .from(eventDomains)
      .where(eq(eventDomains.eventId, LEGACY_EVENT_ID));
    if ((existing?.n ?? 0) === 0) {
      const [res] = await db
        .insert(eventDomains)
        .ignore()
        .values({ eventId: LEGACY_EVENT_ID, host, isPrimary: true });
      domainsCreated = res.affectedRows;
    }
  }
  return { settingsCreated, adminsCreated, domainsCreated, membersCreated };
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
