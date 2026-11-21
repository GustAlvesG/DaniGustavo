import { randomBytes } from "node:crypto";
import {
  and,
  asc,
  eq,
  eventDomains,
  isNotNull,
  isUniqueViolation,
  sql,
  type Database,
} from "@casamento/db";
import type { EventDomainView, EventDomainsResponse } from "@casamento/shared";
import type { Revalidate } from "../admin/revalidate.ts";
import type { Env } from "../env.ts";
import type { EventResolver } from "../tenancy/resolver.ts";
import type { EventCtx } from "../tenancy/types.ts";
import { checkDomainTxt, verificationRecordName } from "./dns.ts";

/*
 * Fase 6, frente B (docs/saas/fase-6.md §3 "Domínios"): domínios de um evento.
 * - Subdomínio da plataforma `<slug>.<PLATFORM_BASE_DOMAIN>` (`kind = platform`): verificado na
 *   hora (a plataforma controla o DNS da base).
 * - Domínio próprio (`kind = custom`): nasce sem `verified_at` e com um `verification_token`;
 *   só resolve (resolver, /api/hosts, ask do Caddy) depois que o TXT
 *   `_plataforma-verificacao.<host>` com o token aparece no DNS.
 * O primário só pode ser um domínio verificado. `event_domains` é tabela de estrutura (o escopo
 * é a própria linha), mas toda consulta daqui filtra pelo evento do contexto mesmo assim.
 */

export type DomainEnv = Pick<Env, "PLATFORM_BASE_DOMAIN" | "PLATFORM_HOST">;

export interface DomainDeps {
  db: Database;
  env: DomainEnv;
  resolver: EventResolver;
  revalidate: Revalidate;
  now: () => Date;
}

/** Falha com status e mensagem pt-BR; `field` marca o campo do formulário. */
export class DomainError extends Error {
  readonly status: 404 | 409 | 422;
  readonly field: string | undefined;
  constructor(status: DomainError["status"], message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

const NOT_FOUND = "Domínio não encontrado.";

/** Host da base sem a porta (a porta só existe em desenvolvimento). */
const bare = (host: string) => host.replace(/:\d+$/, "");

/** `<slug>.<base>` (com a porta da base, se houver: `ana.localhost:3000`). */
export function platformSubdomain(slug: string, base: string): string {
  const b = base.trim().toLowerCase();
  const port = /:\d+$/.exec(b)?.[0] ?? "";
  return `${slug}.${bare(b)}${port}`;
}

/** O host é da plataforma (o próprio PLATFORM_HOST, a base ou um subdomínio dela)? */
export function isPlatformOwnedHost(host: string, env: DomainEnv): boolean {
  const h = bare(host.toLowerCase());
  if (env.PLATFORM_HOST && h === bare(env.PLATFORM_HOST.toLowerCase())) return true;
  const base = env.PLATFORM_BASE_DOMAIN ? bare(env.PLATFORM_BASE_DOMAIN.toLowerCase()) : null;
  return base !== null && (h === base || h.endsWith(`.${base}`));
}

/** Valor do TXT: 32 hex (não é segredo; prova que quem cadastrou controla o DNS). */
const newVerificationToken = () => `plataforma-${randomBytes(16).toString("hex")}`;

type DomainRow = typeof eventDomains.$inferSelect;

/** `id <> ?` (o pacote do banco não reexporta `ne`). */
const notId = (id: number) => sql`${eventDomains.id} <> ${id}`;

function toView(row: DomainRow, env: DomainEnv): EventDomainView {
  const verified = row.verifiedAt !== null;
  return {
    id: row.id,
    host: row.host,
    kind: row.kind,
    isPrimary: row.isPrimary,
    verified,
    verification:
      !verified && row.kind === "custom" && row.verificationToken
        ? {
            txtName: verificationRecordName(row.host),
            txtValue: row.verificationToken,
            target: env.PLATFORM_HOST ? bare(env.PLATFORM_HOST) : null,
          }
        : null,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    checkError: row.checkError,
  };
}

async function rowsOf(db: Database, eventId: number): Promise<DomainRow[]> {
  return db
    .select()
    .from(eventDomains)
    .where(eq(eventDomains.eventId, eventId))
    .orderBy(asc(eventDomains.id));
}

async function rowOf(db: Database, eventId: number, domainId: number): Promise<DomainRow> {
  const [row] = await db
    .select()
    .from(eventDomains)
    .where(and(eq(eventDomains.id, domainId), eq(eventDomains.eventId, eventId)));
  if (!row) throw new DomainError(404, NOT_FOUND);
  return row;
}

export async function listDomains(
  db: Database,
  env: DomainEnv,
  eventId: number,
): Promise<EventDomainsResponse> {
  const rows = await rowsOf(db, eventId);
  return {
    domains: rows.map((r) => toView(r, env)),
    baseDomain: env.PLATFORM_BASE_DOMAIN ?? null,
  };
}

/** Depois de qualquer mudança: o resolver esquece o evento e o site refaz as páginas. */
async function changed(deps: DomainDeps, eventId: number) {
  deps.resolver.invalidate(eventId);
  await deps.revalidate(eventId, ["site"]);
}

async function hasVerifiedPrimary(db: Database, eventId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: eventDomains.id })
    .from(eventDomains)
    .where(
      and(
        eq(eventDomains.eventId, eventId),
        eq(eventDomains.isPrimary, true),
        isNotNull(eventDomains.verifiedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Marca o domínio como o único primário do evento (numa transação). */
async function setPrimary(db: Database, eventId: number, domainId: number) {
  await db.transaction(async (tx) => {
    await tx
      .update(eventDomains)
      .set({ isPrimary: false })
      .where(and(eq(eventDomains.eventId, eventId), notId(domainId)));
    await tx
      .update(eventDomains)
      .set({ isPrimary: true })
      .where(and(eq(eventDomains.eventId, eventId), eq(eventDomains.id, domainId)));
  });
}

const TAKEN = "Esse domínio já está cadastrado em outro evento ou neste.";

/** Domínio próprio: nasce não verificado, com o token do TXT. */
export async function addCustomDomain(
  deps: DomainDeps,
  event: EventCtx,
  host: string,
): Promise<EventDomainView> {
  const { db, env } = deps;
  if (isPlatformOwnedHost(host, env)) {
    throw new DomainError(
      422,
      "Esse endereço é da plataforma. Para o subdomínio automático, use “Criar endereço da plataforma”.",
      "host",
    );
  }
  if (!bare(host).includes(".")) {
    throw new DomainError(422, "Use um domínio completo, como anaebruno.com.br.", "host");
  }
  try {
    const [res] = await db.insert(eventDomains).values({
      eventId: event.id,
      host,
      isPrimary: false,
      kind: "custom",
      verificationToken: newVerificationToken(),
      verifiedAt: null,
    });
    await changed(deps, event.id);
    return toView(await rowOf(db, event.id, res.insertId), env);
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError(409, TAKEN, "host");
    throw err;
  }
}

/** `<slug>.<base>`: verificado na hora; vira primário se o evento ainda não tem um. */
export async function addPlatformDomain(
  deps: DomainDeps,
  event: EventCtx,
): Promise<EventDomainView> {
  const { db, env } = deps;
  if (!env.PLATFORM_BASE_DOMAIN) {
    throw new DomainError(
      422,
      "A plataforma ainda não tem um domínio base para endereços automáticos.",
    );
  }
  const host = platformSubdomain(event.slug, env.PLATFORM_BASE_DOMAIN);
  const [existing] = await db.select().from(eventDomains).where(eq(eventDomains.host, host));
  if (existing) {
    if (existing.eventId !== event.id) throw new DomainError(409, TAKEN);
    return toView(existing, env);
  }
  const primary = !(await hasVerifiedPrimary(db, event.id));
  let id: number;
  try {
    const [res] = await db.insert(eventDomains).values({
      eventId: event.id,
      host,
      kind: "platform",
      isPrimary: false,
      verifiedAt: deps.now(),
    });
    id = res.insertId;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError(409, TAKEN);
    throw err;
  }
  if (primary) await setPrimary(db, event.id, id);
  await changed(deps, event.id);
  return toView(await rowOf(db, event.id, id), env);
}

/** Confere o TXT agora. Deu certo e o evento não tem primário: este vira o primário. */
export async function verifyDomain(
  deps: DomainDeps,
  event: EventCtx,
  domainId: number,
): Promise<EventDomainView> {
  const { db, env } = deps;
  const row = await rowOf(db, event.id, domainId);
  if (row.verifiedAt || !row.verificationToken) return toView(row, env);
  const check = await checkDomainTxt(row.host, row.verificationToken);
  const now = deps.now();
  await db
    .update(eventDomains)
    .set({
      lastCheckedAt: now,
      checkError: check.error,
      ...(check.ok ? { verifiedAt: now } : {}),
    })
    .where(and(eq(eventDomains.id, domainId), eq(eventDomains.eventId, event.id)));
  if (check.ok) {
    if (!(await hasVerifiedPrimary(db, event.id))) await setPrimary(db, event.id, domainId);
    await changed(deps, event.id);
  }
  return toView(await rowOf(db, event.id, domainId), env);
}

export async function makePrimary(
  deps: DomainDeps,
  event: EventCtx,
  domainId: number,
): Promise<EventDomainView> {
  const row = await rowOf(deps.db, event.id, domainId);
  if (!row.verifiedAt) {
    throw new DomainError(409, "Só um domínio verificado pode ser o endereço principal.");
  }
  if (!row.isPrimary) {
    await setPrimary(deps.db, event.id, domainId);
    await changed(deps, event.id);
  }
  return toView(await rowOf(deps.db, event.id, domainId), deps.env);
}

/** Remove. O primário só sai se houver outro verificado (que vira o primário). */
export async function removeDomain(deps: DomainDeps, event: EventCtx, domainId: number) {
  const { db } = deps;
  const row = await rowOf(db, event.id, domainId);
  if (row.isPrimary) {
    const [next] = await db
      .select({ id: eventDomains.id })
      .from(eventDomains)
      .where(
        and(
          eq(eventDomains.eventId, event.id),
          notId(domainId),
          isNotNull(eventDomains.verifiedAt),
        ),
      )
      .orderBy(asc(eventDomains.id))
      .limit(1);
    if (!next) {
      throw new DomainError(
        409,
        "Este é o endereço principal do evento. Cadastre e verifique outro antes de removê-lo.",
      );
    }
    await setPrimary(db, event.id, next.id);
  }
  await db
    .delete(eventDomains)
    .where(and(eq(eventDomains.id, domainId), eq(eventDomains.eventId, event.id)));
  await changed(deps, event.id);
}
