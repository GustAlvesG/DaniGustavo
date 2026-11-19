import { and, eq, eventDomains, events, type Database } from "@casamento/db";
import type { EventCtx } from "./types.ts";

export interface EventResolver {
  bySlug(slug: string): Promise<EventCtx | null>;
  byId(id: number): Promise<EventCtx | null>;
  /** Pelo header Host (minúsculo, com porta), via event_domains. */
  byHost(host: string): Promise<EventCtx | null>;
  /** Host primário do evento em event_domains, ou null se não houver. */
  primaryHost(eventId: number): Promise<string | null>;
  /** Sem argumento limpa tudo; com id, só o que aponta para o evento (e as buscas sem resultado). */
  invalidate(eventId?: number): void;
}

export interface EventResolverOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface Entry<T> {
  value: T;
  eventId: number | null;
  expires: number;
}

/** LRU com prazo: Map guarda a ordem de inserção; ler move a chave para o fim. */
class TtlLru {
  private map = new Map<string, Entry<unknown>>();
  private ttlMs: number;
  private max: number;
  private now: () => number;

  constructor(ttlMs: number, max: number, now: () => number) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.now = now;
  }

  get<T>(key: string): { hit: true; value: T } | { hit: false } {
    const entry = this.map.get(key);
    if (!entry) return { hit: false };
    if (entry.expires <= this.now()) {
      this.map.delete(key);
      return { hit: false };
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return { hit: true, value: entry.value as T };
  }

  set(key: string, value: unknown, eventId: number | null) {
    this.map.delete(key);
    this.map.set(key, { value, eventId, expires: this.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  invalidate(eventId?: number) {
    if (eventId === undefined) return this.map.clear();
    for (const [key, entry] of this.map) {
      if (entry.eventId === eventId || entry.eventId === null) this.map.delete(key);
    }
  }
}

const columns = {
  id: events.id,
  slug: events.slug,
  orgId: events.organizationId,
  timezone: events.timezone,
  name: events.name,
  type: events.type,
  status: events.status,
  startsAt: events.startsAt,
};

/** Resolve slug/id/host → evento com cache em memória (60 s por padrão; por processo). */
export function createEventResolver(
  db: Database,
  { ttlMs = 60_000, maxEntries = 1000, now = Date.now }: EventResolverOptions = {},
): EventResolver {
  const cache = new TtlLru(ttlMs, maxEntries, now);

  async function cached<T>(
    key: string,
    load: () => Promise<T>,
    idOf: (v: T) => number | null,
  ): Promise<T> {
    const hit = cache.get<T>(key);
    if (hit.hit) return hit.value;
    const value = await load();
    cache.set(key, value, idOf(value));
    return value;
  }

  const eventId = (ev: EventCtx | null) => ev?.id ?? null;

  return {
    bySlug: (slug) =>
      cached(
        `slug:${slug}`,
        async () => (await db.select(columns).from(events).where(eq(events.slug, slug)))[0] ?? null,
        eventId,
      ),
    byId: (id) =>
      cached(
        `id:${id}`,
        async () => (await db.select(columns).from(events).where(eq(events.id, id)))[0] ?? null,
        eventId,
      ),
    byHost: (host) => {
      const normalized = host.trim().toLowerCase();
      return cached(
        `host:${normalized}`,
        async () =>
          (
            await db
              .select(columns)
              .from(eventDomains)
              .innerJoin(events, eq(events.id, eventDomains.eventId))
              .where(eq(eventDomains.host, normalized))
          )[0] ?? null,
        eventId,
      );
    },
    primaryHost: (id) =>
      cached(
        `primary:${id}`,
        async () =>
          (
            await db
              .select({ host: eventDomains.host })
              .from(eventDomains)
              .where(and(eq(eventDomains.eventId, id), eq(eventDomains.isPrimary, true)))
              .limit(1)
          )[0]?.host ?? null,
        () => id,
      ),
    invalidate: (id) => cache.invalidate(id),
  };
}

const shared = new WeakMap<Database, EventResolver>();

/** Resolver único por conexão, para quem não recebeu um injetado (rotinas, scripts, testes). */
export function resolverFor(db: Database, given?: EventResolver): EventResolver {
  if (given) return given;
  let r = shared.get(db);
  if (!r) {
    r = createEventResolver(db);
    shared.set(db, r);
  }
  return r;
}
