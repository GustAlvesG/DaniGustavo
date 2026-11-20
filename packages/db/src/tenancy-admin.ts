import { hashPassword } from "better-auth/crypto";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, like } from "drizzle-orm";
import { ulid } from "ulid";
import type { Database } from "./client.ts";
import {
  assertEventSlug,
  createEventRecord,
  isUniqueViolation,
  normalizeEventHost,
} from "./event-service.ts";
import { gifts } from "./schema/app.ts";
import { account, user } from "./schema/auth.ts";
import {
  eventDomains,
  eventMembers,
  events,
  LEGACY_EVENT_ID,
  organizationMembers,
  organizations,
} from "./schema/tenancy.ts";

// Operações de administração da plataforma usadas pela CLI (cli.ts). Cada função lança Error com
// mensagem em pt-BR quando a entrada é inválida.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Aceita id numérico ou slug. */
export async function resolveOrganization(db: Database, ref: string) {
  const where = /^\d+$/.test(ref) ? eq(organizations.id, Number(ref)) : eq(organizations.slug, ref);
  const [row] = await db.select().from(organizations).where(where);
  if (!row) throw new Error(`Organização não encontrada: "${ref}".`);
  return row;
}

/** Aceita id numérico ou slug. */
export async function resolveEvent(db: Database, ref: string) {
  const where = /^\d+$/.test(ref) ? eq(events.id, Number(ref)) : eq(events.slug, ref);
  const [row] = await db.select().from(events).where(where);
  if (!row) throw new Error(`Evento não encontrado: "${ref}".`);
  return row;
}

export async function createOrganization(db: Database, input: { slug: string; name: string }) {
  const slug = assertEventSlug(input.slug);
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome da organização.");
  try {
    const [res] = await db.insert(organizations).values({ slug, name });
    return { id: res.insertId, slug, name };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Já existe uma organização com o slug "${slug}".`);
    }
    throw error;
  }
}

export interface CreateEventInput {
  org: string;
  slug: string;
  name: string;
  type: string;
  startsAt: string;
  timezone?: string;
  status?: string;
}

/** Cria o evento (CLI): resolve a organização e usa o serviço compartilhado com o painel. */
export async function createEvent(db: Database, input: CreateEventInput) {
  const org = await resolveOrganization(db, input.org);
  const created = await createEventRecord(db, {
    organizationId: org.id,
    slug: input.slug,
    name: input.name,
    type: input.type,
    startsAt: input.startsAt,
    timezone: input.timezone,
    status: input.status,
  });
  return {
    id: created.id,
    slug: created.slug,
    organizationId: created.organizationId,
    status: created.status,
  };
}

export async function addDomain(
  db: Database,
  input: { event: string; host: string; primary?: boolean },
) {
  const event = await resolveEvent(db, input.event);
  const host = normalizeEventHost(input.host);
  const primary = input.primary === true;
  try {
    await db.transaction(async (tx) => {
      if (primary) {
        await tx
          .update(eventDomains)
          .set({ isPrimary: false })
          .where(eq(eventDomains.eventId, event.id));
      }
      await tx.insert(eventDomains).values({ eventId: event.id, host, isPrimary: primary });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(`O host "${host}" já está cadastrado.`);
    throw error;
  }
  return { eventId: event.id, host, isPrimary: primary };
}

export interface AddUserInput {
  email: string;
  name: string;
  platformAdmin?: boolean;
  org?: string;
  event?: string;
  role?: string;
}

export interface AddUserResult {
  userId: string;
  created: boolean;
  /** Senha temporária; só existe quando o usuário foi criado agora. */
  temporaryPassword: string | null;
  /** Se o vínculo com a organização/evento foi criado agora (false se já existia). */
  linked: boolean;
}

export async function addUser(db: Database, input: AddUserInput): Promise<AddUserResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`E-mail inválido: "${input.email}".`);
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do usuário.");
  if (input.org && input.event) throw new Error("Use --org ou --event, não os dois.");
  if (input.org && input.role !== "owner" && input.role !== "member") {
    throw new Error("Com --org, o papel (--role) deve ser owner ou member.");
  }
  if (input.event && input.role !== "host") {
    throw new Error("Com --event, o papel (--role) deve ser host.");
  }
  if (!input.org && !input.event && !input.platformAdmin) {
    throw new Error("Informe --org, --event ou --platform-admin.");
  }
  const org = input.org ? await resolveOrganization(db, input.org) : null;
  const event = input.event ? await resolveEvent(db, input.event) : null;

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const userId = existing?.id ?? ulid();
  let temporaryPassword: string | null = null;
  if (!existing) {
    temporaryPassword = randomBytes(12).toString("base64url");
    const hash = await hashPassword(temporaryPassword);
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id: userId, name, email, emailVerified: true });
      // Conta "credential" é a que o Better Auth usa no login por e-mail e senha (como no seed).
      await tx.insert(account).values({
        id: ulid(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hash,
      });
    });
  }

  if (input.platformAdmin) {
    await db.update(user).set({ platformRole: "admin" }).where(eq(user.id, userId));
  }
  let linked = false;
  if (org) {
    const [res] = await db
      .insert(organizationMembers)
      .ignore()
      .values({ organizationId: org.id, userId, role: input.role as "owner" | "member" });
    linked = res.affectedRows === 1;
  } else if (event) {
    const [res] = await db
      .insert(eventMembers)
      .ignore()
      .values({ eventId: event.id, userId, role: "host" });
    linked = res.affectedRows === 1;
  }
  return { userId, created: !existing, temporaryPassword, linked };
}

export interface EventListRow {
  id: number;
  slug: string;
  organization: string;
  status: string;
  domains: string[];
}

export async function listEvents(db: Database): Promise<EventListRow[]> {
  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      organization: organizations.slug,
      status: events.status,
    })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.organizationId))
    .orderBy(events.id);
  const domains = await db
    .select({
      eventId: eventDomains.eventId,
      host: eventDomains.host,
      isPrimary: eventDomains.isPrimary,
    })
    .from(eventDomains)
    .orderBy(eventDomains.id);
  return rows.map((r) => ({
    ...r,
    domains: domains
      .filter((d) => d.eventId === r.id)
      .map((d) => (d.isPrimary ? `${d.host} (primário)` : d.host)),
  }));
}

/**
 * Move os arquivos da raiz de `uploadDir` para `uploadDir/<eventId>/` e reescreve
 * `gifts.image` (`/uploads/<arquivo>` → `/uploads/<eventId>/<arquivo>`) do evento.
 * Idempotente: sem arquivos na raiz nem caminhos antigos, não faz nada.
 */
export async function migrateUploads(
  db: Database,
  uploadDir: string,
  eventId: number = LEGACY_EVENT_ID,
): Promise<{ filesMoved: number; giftsUpdated: number }> {
  const target = join(uploadDir, String(eventId));
  let filesMoved = 0;
  const names = await readdir(uploadDir).catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return [] as string[];
    throw e;
  });
  for (const file of names) {
    if ((await stat(join(uploadDir, file))).isFile()) {
      await mkdir(target, { recursive: true });
      await rename(join(uploadDir, file), join(target, file));
      filesMoved++;
    }
  }

  const rows = await db
    .select({ id: gifts.id, image: gifts.image })
    .from(gifts)
    .where(and(eq(gifts.eventId, eventId), like(gifts.image, "/uploads/%")));
  let giftsUpdated = 0;
  for (const g of rows) {
    const rest = g.image!.slice("/uploads/".length);
    if (rest === "" || rest.includes("/")) continue; // já migrado
    await db
      .update(gifts)
      .set({ image: `/uploads/${eventId}/${rest}` })
      .where(eq(gifts.id, g.id));
    giftsUpdated++;
  }
  return { filesMoved, giftsUpdated };
}
