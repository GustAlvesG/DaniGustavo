import { EVENT_TYPES, HOST_MAX, HOST_PATTERN, SLUG_MAX, SLUG_PATTERN } from "@casamento/shared";
import { eq } from "drizzle-orm";
import type { Database } from "./client.ts";
import { eventSettings } from "./schema/app.ts";
import {
  EVENT_STATUSES,
  eventDomains,
  events,
  type EventStatus,
  type EventType,
} from "./schema/tenancy.ts";

/*
 * Criação de evento compartilhada pela CLI (`event:create`, tenancy-admin.ts) e pelo painel da
 * organização (Fase 3, POST /api/admin/orgs/:orgId/events). Os padrões do tipo (módulos,
 * vocabulário, tema, lados e seções do site) NÃO são gravados: valem por ausência da chave
 * (`modulesFor`, `vocabularyFor`, `resolveTheme`, `defaultSides`, `defaultSections`), então
 * trocar o tipo depois continua coerente. Só vão para `event_settings` os dados do evento.
 */

export type EventInputField =
  "slug" | "name" | "type" | "status" | "startsAt" | "timezone" | "host";

/** Entrada inválida ou em conflito; `field` diz qual campo do formulário marcar. */
export class EventInputError extends Error {
  readonly field: EventInputField;
  /** `taken` = slug ou domínio já usado (409 na API); `invalid` = formato (422). */
  readonly reason: "invalid" | "taken";
  constructor(field: EventInputField, reason: "invalid" | "taken", message: string) {
    super(message);
    this.name = "EventInputError";
    this.field = field;
    this.reason = reason;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "ER_DUP_ENTRY" || e?.cause?.code === "ER_DUP_ENTRY";
}

/** Slug de evento válido (minúsculas, números e hífens, até 64) ou lança EventInputError. */
export function assertEventSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug) || slug.length > SLUG_MAX) {
    throw new EventInputError(
      "slug",
      "invalid",
      `Slug inválido: "${slug}". Use minúsculas, números e hífens (até ${SLUG_MAX}).`,
    );
  }
  return slug;
}

/** Host normalizado (minúsculo, sem espaços) ou lança EventInputError. */
export function normalizeEventHost(raw: string): string {
  const host = raw.trim().toLowerCase();
  if (!HOST_PATTERN.test(host) || host.length > HOST_MAX) {
    throw new EventInputError(
      "host",
      "invalid",
      `Host inválido: "${raw}". Use algo como exemplo.com ou localhost:3000.`,
    );
  }
  return host;
}

/** O slug ainda não é usado por nenhum evento da plataforma (slugs são globais). */
export async function isEventSlugAvailable(db: Database, slug: string): Promise<boolean> {
  const [row] = await db.select({ id: events.id }).from(events).where(eq(events.slug, slug));
  return !row;
}

/** O host ainda não pertence a nenhum evento. */
export async function isEventHostAvailable(db: Database, host: string): Promise<boolean> {
  const [row] = await db
    .select({ id: eventDomains.id })
    .from(eventDomains)
    .where(eq(eventDomains.host, host));
  return !row;
}

export function eventInitials(name: string): string {
  return name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 || /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export interface NewEventInput {
  organizationId: number;
  slug: string;
  name: string;
  type: string;
  /** ISO com offset explícito (ex.: 2027-04-10T16:00:00-03:00); vai para `wedding.datetime`. */
  startsAt: string;
  timezone?: string;
  status?: string;
  /** Domínio próprio opcional; entra como host primário em `event_domains`. */
  host?: string | null;
  /**
   * Fase 6: domínio base dos endereços automáticos. Com ele o evento ganha
   * `<slug>.<base>` (`kind = platform`, verificado na hora; primário se não veio `host`).
   * Omitido = `PLATFORM_BASE_DOMAIN` do ambiente; `null` = sem subdomínio.
   */
  platformBaseDomain?: string | null;
}

export interface NewEventResult {
  id: number;
  slug: string;
  organizationId: number;
  status: EventStatus;
  host: string | null;
  /** Fase 6: `<slug>.<PLATFORM_BASE_DOMAIN>` criado com o evento (null = sem base). */
  platformHost: string | null;
}

/** `<slug>.<base>` (a porta da base, em desenvolvimento, vai para o fim: `ana.localhost:3000`). */
export function platformEventHost(slug: string, base: string): string {
  const b = base.trim().toLowerCase();
  const port = /:\d+$/.exec(b)?.[0] ?? "";
  return `${slug}.${b.replace(/:\d+$/, "")}${port}`;
}

/**
 * Valida e cria o evento (+ chaves neutras de `event_settings` + domínio opcional) numa
 * transação. Erros de entrada/conflito saem como EventInputError com mensagem pt-BR. A
 * organização precisa existir (quem chama já resolveu: CLI por id/slug, API pelo contexto).
 */
export async function createEventRecord(
  db: Database,
  input: NewEventInput,
): Promise<NewEventResult> {
  const slug = assertEventSlug(input.slug);
  const name = input.name.trim();
  if (!name) throw new EventInputError("name", "invalid", "Informe o nome do evento.");
  if (!(EVENT_TYPES as readonly string[]).includes(input.type)) {
    throw new EventInputError(
      "type",
      "invalid",
      `Tipo inválido: "${input.type}". Use ${EVENT_TYPES.join(", ")}.`,
    );
  }
  const status = (input.status ?? "draft") as EventStatus;
  if (!(EVENT_STATUSES as readonly string[]).includes(status)) {
    throw new EventInputError(
      "status",
      "invalid",
      `Status inválido: "${status}". Use ${EVENT_STATUSES.join(", ")}.`,
    );
  }
  // Exige offset explícito para não depender do fuso da máquina.
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(input.startsAt)) {
    throw new EventInputError(
      "startsAt",
      "invalid",
      "--starts-at precisa de offset, ex.: 2027-04-10T16:00:00-03:00.",
    );
  }
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new EventInputError("startsAt", "invalid", `Data inválida: "${input.startsAt}".`);
  }
  const timezone = input.timezone ?? "America/Sao_Paulo";
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone });
  } catch {
    throw new EventInputError("timezone", "invalid", `Fuso horário inválido: "${timezone}".`);
  }
  const host = input.host ? normalizeEventHost(input.host) : null;
  if (host && !(await isEventHostAvailable(db, host))) {
    throw new EventInputError("host", "taken", `O host "${host}" já está cadastrado.`);
  }
  // Fase 6: subdomínio automático. Se já estiver ocupado (não deveria: o slug é único), o
  // evento nasce sem ele e o painel oferece criar depois.
  const base =
    input.platformBaseDomain === undefined
      ? process.env.PLATFORM_BASE_DOMAIN?.trim() || null
      : input.platformBaseDomain;
  let platformHost = base ? platformEventHost(slug, base) : null;
  if (platformHost && (platformHost === host || !(await isEventHostAvailable(db, platformHost)))) {
    platformHost = null;
  }

  let eventId: number;
  try {
    eventId = await db.transaction(async (tx) => {
      const [res] = await tx.insert(events).values({
        organizationId: input.organizationId,
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
        { eventId: id, key: "couple.monogram", value: eventInitials(name), isPublic: true },
        { eventId: id, key: "wedding.datetime", value: input.startsAt, isPublic: true },
        { eventId: id, key: "wedding.timezone", value: timezone, isPublic: true },
      ]);
      if (host) await tx.insert(eventDomains).values({ eventId: id, host, isPrimary: true });
      if (platformHost) {
        await tx.insert(eventDomains).values({
          eventId: id,
          host: platformHost,
          isPrimary: !host,
          kind: "platform",
        });
      }
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Corrida entre a conferência e o insert: descobre qual único estourou.
      if (host && !(await isEventHostAvailable(db, host))) {
        throw new EventInputError("host", "taken", `O host "${host}" já está cadastrado.`);
      }
      throw new EventInputError("slug", "taken", `Já existe um evento com o slug "${slug}".`);
    }
    throw error;
  }
  return { id: eventId, slug, organizationId: input.organizationId, status, host, platformHost };
}
