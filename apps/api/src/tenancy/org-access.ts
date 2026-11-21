import { and, asc, eq, organizationMembers, organizations, type Database } from "@casamento/db";
import { ORG_ACCESS_ROLES, type MeOrganization, type OrgAction } from "@casamento/shared";
import type { MiddlewareHandler } from "hono";
import type { AdminUser } from "../admin/context.ts";
import { apiError, ERROR_CODES, routeNotFound } from "../errors.ts";
import type { EventResolver } from "./resolver.ts";
import type { EventCtx, OrgAccessRole, OrgAdminEnv, OrgCtx } from "./types.ts";

// Fase 3: acesso ao painel da organização (`/api/admin/orgs/:orgId/*`). Mesmo desenho do
// requireEventAccess: quem não participa recebe o 404 de rota inexistente.

type AccessUser = Pick<AdminUser, "id" | "platformRole">;

const ALL = ORG_ACCESS_ROLES;

/**
 * Matriz ação → papéis da organização. Padrão: membro cria evento e cuida dos anfitriões;
 * só dono (e platform admin) mexe na equipe. Restringir é mudar uma linha.
 */
export const ORG_PERMISSIONS: Record<OrgAction, readonly OrgAccessRole[]> = {
  "org.read": ALL,
  "events.create": ALL,
  "team.manage": ["platform_admin", "org_owner"],
  "hosts.manage": ALL,
  // Fase 4: catálogo de fornecedores e modelos de tarefas (ler é org.read).
  "vendors.manage": ALL,
  "templates.manage": ALL,
  // Fase 5: a subconta da organização (dados da pessoa/empresa e o dinheiro) é do dono.
  "payments.manage": ["platform_admin", "org_owner"],
};

export function canOrg(role: OrgAccessRole, action: OrgAction): boolean {
  return ORG_PERMISSIONS[action].includes(role);
}

/** Papel do usuário na organização, ou null. Anfitrião de evento não entra na organização. */
export async function resolveOrgRole(
  db: Database,
  user: AccessUser,
  orgId: number,
): Promise<OrgAccessRole | null> {
  if (user.platformRole === "admin") return "platform_admin";
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, user.id)),
    );
  if (!row) return null;
  return row.role === "owner" ? "org_owner" : "org_member";
}

/** Organizações que o usuário abre no painel (para o /me). */
export async function listAccessibleOrgs(
  db: Database,
  user: AccessUser,
): Promise<MeOrganization[]> {
  const columns = {
    id: organizations.id,
    slug: organizations.slug,
    name: organizations.name,
    status: organizations.status,
  };
  if (user.platformRole === "admin") {
    const rows = await db.select(columns).from(organizations).orderBy(asc(organizations.id));
    return rows.map((r) => ({ ...r, role: "platform_admin" as const }));
  }
  const rows = await db
    .select({ ...columns, memberRole: organizationMembers.role })
    .from(organizations)
    .innerJoin(organizationMembers, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, user.id))
    .orderBy(asc(organizations.id));
  return rows.map(({ memberRole, ...r }) => ({
    ...r,
    role: memberRole === "owner" ? ("org_owner" as const) : ("org_member" as const),
  }));
}

const ID = /^[1-9]\d{0,15}$/;
const parseId = (raw: string | undefined) =>
  raw && ID.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;

/**
 * `/api/admin/orgs/:orgId/*`, depois de requireSession. Põe `org` e `orgRole` no contexto.
 * orgId inválido, organização inexistente ou sem acesso → o mesmo 404 de rota inexistente.
 */
export function requireOrgAccess(db: Database): MiddlewareHandler<OrgAdminEnv> {
  return async (c, next) => {
    const orgId = parseId(c.req.param("orgId"));
    if (!orgId) return routeNotFound(c);
    const [org] = await db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        status: organizations.status,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (!org) return routeNotFound(c);
    const role = await resolveOrgRole(db, c.get("user"), org.id);
    if (!role) return routeNotFound(c);
    c.set("org", org satisfies OrgCtx);
    c.set("orgRole", role);
    await next();
  };
}

/** Depois de requireOrgAccess: sem permissão para a ação → 403. */
export function requireOrgPermission(action: OrgAction): MiddlewareHandler<OrgAdminEnv> {
  return async (c, next) => {
    if (!canOrg(c.get("orgRole"), action)) {
      return apiError(
        c,
        403,
        ERROR_CODES.unauthorized,
        "Você não tem permissão para fazer isso nesta organização.",
      );
    }
    await next();
  };
}

/** Rotas `/api/admin/orgs/:orgId/events/:eventId/*` (anfitriões, permissões do anfitrião). */
export type OrgEventEnv = {
  Variables: OrgAdminEnv["Variables"] & { event: EventCtx };
};

/**
 * Depois de requireOrgAccess: o `:eventId` precisa ser um evento desta organização (senão o
 * 404 de rota). Põe `event` no contexto. Não dá acesso a quem é só anfitrião do evento.
 */
export function requireOrgEvent(
  db: Database,
  resolver: EventResolver,
): MiddlewareHandler<OrgEventEnv> {
  return async (c, next) => {
    const eventId = parseId(c.req.param("eventId"));
    if (!eventId) return routeNotFound(c);
    const event = await resolver.byId(eventId);
    if (!event || event.orgId !== c.get("org").id) return routeNotFound(c);
    c.set("event", event);
    await next();
  };
}
