/*
 * Rotas por hash do painel, em funções puras (testadas em apps/api/test/painel-routes.test.ts).
 * Evento: `#/e/:eventId/...`; organização: `#/o/:orgId/...`.
 */

/** "/e/3/convites?x=1" → { eventId: 3, rest: "/convites?x=1" }; outro caminho → null. */
export function parseEventPath(path: string): { eventId: number; rest: string } | null {
  const m = /^\/e\/([1-9]\d{0,15})(\/.*)?$/.exec(path);
  return m ? { eventId: Number(m[1]), rest: m[2] ?? "/" } : null;
}

/** "/o/2/equipe" → { orgId: 2, rest: "/equipe" }; outro caminho → null. */
export function parseOrgPath(path: string): { orgId: number; rest: string } | null {
  const m = /^\/o\/([1-9]\d{0,15})(\/.*)?$/.exec(path);
  return m ? { orgId: Number(m[1]), rest: m[2] ?? "/" } : null;
}

/** Fase 6: "/plataforma/orgs/2" → { rest: "/orgs/2" }; outro caminho → null. */
export function parsePlatformPath(path: string): { rest: string } | null {
  const m = /^\/plataforma(\/.*)?$/.exec(path);
  return m ? { rest: m[1] ?? "/" } : null;
}

/**
 * Para onde o hash deve ir (null = ficar). Um evento só e nenhuma organização: entra direto
 * nele. Vários (ou com organização): lista em #/eventos. Hashes antigos (#/convites/12, sem
 * /e/:id) vão para o mesmo lugar dentro do evento atual (o único, ou o último aberto).
 */
export function resolveRedirect(
  path: string,
  events: { id: number }[],
  remembered: number | null,
  orgs: { id: number }[] = [],
): string | null {
  const orgParsed = parseOrgPath(path);
  if (orgParsed) {
    if (orgs.some((o) => o.id === orgParsed.orgId)) return null;
    return orgs.length > 0 ? `/o/${orgs[0]!.id}` : "/eventos";
  }
  if (events.length === 0) {
    if (path === "/conta") return null;
    if (orgs.length > 0) return `/o/${orgs[0]!.id}`;
    return path === "/eventos" ? null : "/eventos";
  }
  const only = events.length === 1 ? events[0] : undefined;
  const parsed = parseEventPath(path);
  if (parsed) {
    if (events.some((e) => e.id === parsed.eventId)) return null;
    return only ? `/e/${only.id}` : "/eventos";
  }
  if (path === "/eventos") return only && orgs.length === 0 ? `/e/${only.id}` : null;
  const current = only ?? events.find((e) => e.id === remembered);
  if (!current) return path === "/conta" ? null : "/eventos";
  return `/e/${current.id}${path === "/" ? "" : path}`;
}

/** Valor das opções do seletor: "o:2" (organização) ou "e:3" (evento). */
export function pickerValue(kind: "o" | "e", id: number): string {
  return `${kind}:${id}`;
}

/** "e:3" → "/e/3"; "o:2" → "/o/2"; outro valor → "/eventos". */
export function pickerTarget(value: string): string {
  const m = /^([oe]):([1-9]\d{0,15})$/.exec(value);
  return m ? `/${m[1]}/${m[2]}` : "/eventos";
}
