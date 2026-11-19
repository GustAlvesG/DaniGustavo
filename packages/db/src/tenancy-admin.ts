import { hashPassword } from "better-auth/crypto";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, like } from "drizzle-orm";
import { ulid } from "ulid";
import type { Database } from "./client.ts";
import { eventSettings, gifts } from "./schema/app.ts";
import { account, user } from "./schema/auth.ts";
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  eventDomains,
  eventMembers,
  events,
  LEGACY_EVENT_ID,
  organizationMembers,
  organizations,
  type EventStatus,
  type EventType,
} from "./schema/tenancy.ts";

// Operações de administração da plataforma usadas pela CLI (cli.ts). Cada função lança Error com
// mensagem em pt-BR quando a entrada é inválida.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HOST = /^[a-z0-9.-]+(:\d+)?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertSlug(slug: string): string {
  if (!SLUG.test(slug) || slug.length > 64) {
    throw new Error(`Slug inválido: "${slug}". Use minúsculas, números e hífens (até 64).`);
  }
  return slug;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY";
}

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
  const slug = assertSlug(input.slug);
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

function initials(name: string): string {
  return name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 || /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Cria o evento e as chaves neutras de `event_settings` (sem conteúdo do casamento). */
export async function createEvent(db: Database, input: CreateEventInput) {
  const org = await resolveOrganization(db, input.org);
  const slug = assertSlug(input.slug);
  const name = input.name.trim();
  if (!name) throw new Error("Informe o nome do evento.");
  if (!(EVENT_TYPES as readonly string[]).includes(input.type)) {
    throw new Error(`Tipo inválido: "${input.type}". Use ${EVENT_TYPES.join(", ")}.`);
  }
  const status = (input.status ?? "draft") as EventStatus;
  if (!(EVENT_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Status inválido: "${status}". Use ${EVENT_STATUSES.join(", ")}.`);
  }
  // Exige offset explícito para não depender do fuso da máquina.
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(input.startsAt)) {
    throw new Error("--starts-at precisa de offset, ex.: 2027-04-10T16:00:00-03:00.");
  }
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error(`Data inválida: "${input.startsAt}".`);
  const timezone = input.timezone ?? "America/Sao_Paulo";
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone });
  } catch {
    throw new Error(`Fuso horário inválido: "${timezone}".`);
  }

  let eventId: number;
  try {
    eventId = await db.transaction(async (tx) => {
      const [res] = await tx.insert(events).values({
        organizationId: org.id,
        slug,
        type: input.type as EventType,
        name,
        status,
        timezone,
        startsAt,
      });
      const id = res.insertId;
      await tx.insert(eventSettings).values([
        { eventId: id, key: "couple.names", value: name, isPublic: true },
        { eventId: id, key: "couple.monogram", value: initials(name), isPublic: true },
        { eventId: id, key: "wedding.datetime", value: input.startsAt, isPublic: true },
        { eventId: id, key: "wedding.timezone", value: timezone, isPublic: true },
      ]);
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(`Já existe um evento com o slug "${slug}".`);
    throw error;
  }
  return { id: eventId, slug, organizationId: org.id, status };
}

export async function addDomain(
  db: Database,
  input: { event: string; host: string; primary?: boolean },
) {
  const event = await resolveEvent(db, input.event);
  const host = input.host.trim().toLowerCase();
  if (!HOST.test(host) || host.length > 191) {
    throw new Error(`Host inválido: "${input.host}". Use algo como exemplo.com ou localhost:3000.`);
  }
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
