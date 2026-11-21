import { hashPassword } from "better-auth/crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
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
import { ensureOrgSubscription, ensurePlans } from "./plan-catalog.ts";
import { ensurePlatformTaskTemplates } from "./platform-task-templates.ts";
import { COURTESY_PLAN_CODE } from "./schema/platform.ts";

/** Organização do casamento (criada também pela migration 0006). */
const LEGACY_ORG_ID = 1;
/** Nome da organização 1 (a migration 0006 a criou como "Organização 1"). */
export const LEGACY_ORG_NAME = "Casamento Dani & Gustavo";

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
  await seedPlatformCatalog(db);
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
    .values({ id: LEGACY_ORG_ID, slug: "org-1", name: LEGACY_ORG_NAME, status: "active" });
  // Bancos vindos da migration 0006 ainda têm o nome provisório: troca só esse.
  await db
    .update(organizations)
    .set({ name: LEGACY_ORG_NAME })
    .where(and(eq(organizations.id, LEGACY_ORG_ID), eq(organizations.name, "Organização 1")));
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
      // Fase 5: o casamento recebe na conta principal (como antes); a migration 0011 faz o mesmo.
      paymentReceiver: "platform",
    });
}

/**
 * Fase 6: planos (organização 1 no plano interno "Cortesia", sem limites nem cobrança) e
 * modelos de tarefas da plataforma. Idempotente.
 */
async function seedPlatformCatalog(db: Database): Promise<void> {
  await ensurePlans(db);
  await ensureOrgSubscription(db, LEGACY_ORG_ID, COURTESY_PLAN_CODE);
  await ensurePlatformTaskTemplates(db);
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
 * Papéis dos usuários do painel (decisão do usuário, 21/11/2026): os dois são donos da
 * organização 1 e o Gustavo (dev, ADMIN_NAMES[1]) é admin da plataforma.
 */
async function seedMembers(db: Database, env: NodeJS.ProcessEnv): Promise<number> {
  const emails = adminEmails(env).map((a) => a.email);
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

  await promotePlatformAdmin(db, env);
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
  if (env.SETUP_WEDDING?.trim() === "0") return setupPlatformOnly(db, env);
  await seedLegacyEvent(db);
  await seedPlatformCatalog(db);
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

/**
 * Setup "só plataforma" (`SETUP_WEDDING=0`, projeto happy4ever ao lado do casamento): planos,
 * modelos de tarefas, contas de ADMIN_EMAIL_* e o admin da plataforma (ADMIN_EMAIL_2), sem
 * evento, sem importar o casamento e sem domínio de SITE_URL. Num banco vazio a migration 0006
 * deixa um evento 1 de reserva ("Evento 1", sem data nem domínio): ele é arquivado para não
 * responder em /api/e/dani-gustavo. Idempotente.
 */
async function setupPlatformOnly(db: Database, env: NodeJS.ProcessEnv): Promise<SetupResult> {
  await ensurePlans(db);
  await ensurePlatformTaskTemplates(db);
  const adminsCreated = await seedAdmins(db, env);
  await promotePlatformAdmin(db, env, true);
  const [domains] = await db
    .select({ n: count() })
    .from(eventDomains)
    .where(eq(eventDomains.eventId, LEGACY_EVENT_ID));
  if ((domains?.n ?? 0) === 0) {
    await db
      .update(events)
      .set({ status: "archived" })
      .where(and(eq(events.id, LEGACY_EVENT_ID), isNull(events.startsAt)));
  }
  return { settingsCreated: 0, adminsCreated, domainsCreated: 0, membersCreated: 0 };
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

/** E-mails de ADMIN_EMAIL_* preenchidos (vazios ignorados), normalizados, com o índice original. */
function adminEmails(env: NodeJS.ProcessEnv): { index: number; email: string }[] {
  return [env.ADMIN_EMAIL_1, env.ADMIN_EMAIL_2].flatMap((raw, index) => {
    const email = raw?.trim().toLowerCase();
    return email ? [{ index, email }] : [];
  });
}

/**
 * `platform_admin` = ADMIN_EMAIL_2 (Gustavo). Sem ele nunca se promove ninguém sozinho; no setup
 * "só plataforma" com só ADMIN_EMAIL_1, avisa (`warnIfMissing`).
 */
async function promotePlatformAdmin(
  db: Database,
  env: NodeJS.ProcessEnv,
  warnIfMissing = false,
): Promise<void> {
  const platformAdmin = env.ADMIN_EMAIL_2?.trim().toLowerCase();
  if (platformAdmin) {
    await db.update(user).set({ platformRole: "admin" }).where(eq(user.email, platformAdmin));
  } else if (warnIfMissing && adminEmails(env).length > 0) {
    console.warn(
      "ADMIN_EMAIL_2 vazio: ninguém foi promovido a admin da plataforma. Defina ADMIN_EMAIL_2 ou use a CLI.",
    );
  }
}

/**
 * Cria os usuários do painel de cada ADMIN_EMAIL_* preenchido (vazios são ignorados) com a senha
 * inicial, se ainda não existirem. Devolve a quantidade criada; o log diz quem foi criado e quem já
 * existia (nunca a senha).
 */
export async function seedAdmins(db: Database, env: NodeJS.ProcessEnv): Promise<number> {
  const admins = adminEmails(env);
  const password = env.ADMIN_PASSWORD_INICIAL;
  if (admins.length === 0) {
    console.warn(
      "Usuários do painel não criados: nenhum ADMIN_EMAIL_1/ADMIN_EMAIL_2 preenchido no .env.",
    );
    return 0;
  }
  if (!password) {
    console.warn(
      "Usuários do painel não criados: defina ADMIN_PASSWORD_INICIAL no .env e rode o seed de novo.",
    );
    return 0;
  }

  const created: string[] = [];
  const existing: string[] = [];
  for (const { index, email } of admins) {
    const found = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (found.length > 0) {
      existing.push(email);
      continue;
    }

    const userId = ulid();
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: ADMIN_NAMES[index] ?? email,
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
    created.push(email);
  }
  console.log(
    `Contas do painel: ${created.length} criada(s)${created.length ? ` (${created.join(", ")})` : ""}; ` +
      `${existing.length} já existia(m)${existing.length ? ` (${existing.join(", ")})` : ""}.`,
  );
  return created.length;
}
