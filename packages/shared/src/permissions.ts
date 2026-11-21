import { z } from "zod";

/*
 * Permissões do painel (Fase 3). As ações por evento vivem aqui (e não só na API) porque o
 * painel mostra a lista de permissões do anfitrião para a organização ajustar. A matriz
 * ação → papéis fica em `apps/api/src/tenancy/permissions.ts`.
 */

/** Ações do painel de um evento (`/api/admin/events/:eventId/*`). */
export const EVENT_ACTIONS = [
  "dashboard.read",
  "invitations.read",
  "invitations.write",
  "gifts.read",
  "gifts.write",
  "orders.read",
  "orders.refund",
  "orders.reconcile",
  "messages.read",
  "messages.moderate",
  "settings.read",
  "settings.write",
  "reminders.read",
  "reminders.write",
  /** Fase 2: ver textos e fotos do site, galeria e aparência. */
  "content.read",
  /** Fase 2: textos e fotos do site, galeria e aparência (tema). */
  "content.write",
  /** Fase 2: tipo do evento, módulos, lados dos convites e vocabulário. */
  "event.configure",
  /** Fase 4: checklist de tarefas do evento (e aplicar modelo da organização). */
  "tasks.read",
  "tasks.write",
  /** Fase 4: fornecedores do evento e contratos (inclui cadastrar no catálogo da organização). */
  "vendors.read",
  "vendors.write",
  /** Fase 4: orçamentos, parcelas e planejado × realizado. */
  "budget.read",
  "budget.write",
  /** Fase 4: cronograma do dia. */
  "schedule.read",
  "schedule.write",
] as const;
export const EventAction = z.enum(EVENT_ACTIONS);
export type EventAction = z.infer<typeof EventAction>;

/** Nome de cada ação no painel (tela de permissões do anfitrião). */
export const EVENT_ACTION_LABELS: Record<EventAction, string> = {
  "dashboard.read": "Ver o início do painel",
  "invitations.read": "Ver convites e respostas",
  "invitations.write": "Criar, editar e importar convites",
  "gifts.read": "Ver a lista de presentes",
  "gifts.write": "Cadastrar e editar presentes",
  "orders.read": "Ver pedidos de presentes",
  "orders.refund": "Reembolsar pedidos",
  "orders.reconcile": "Conciliar pagamentos",
  "messages.read": "Ver os recados",
  "messages.moderate": "Aprovar e remover recados",
  "settings.read": "Ver as configurações do evento",
  "settings.write": "Mudar as configurações do evento",
  "reminders.read": "Ver os lembretes de confirmação",
  "reminders.write": "Configurar e enviar lembretes de confirmação",
  "content.read": "Ver textos, fotos e aparência do site",
  "content.write": "Editar textos, fotos e aparência do site",
  "event.configure": "Mudar tipo, módulos, lados e palavras do evento",
  "tasks.read": "Ver as tarefas",
  "tasks.write": "Criar, editar e concluir tarefas",
  "vendors.read": "Ver fornecedores e contratos",
  "vendors.write": "Cadastrar fornecedores e enviar contratos",
  "budget.read": "Ver orçamentos, parcelas e o financeiro",
  "budget.write": "Editar orçamentos, contratar e registrar pagamentos",
  "schedule.read": "Ver o cronograma do dia",
  "schedule.write": "Editar o cronograma do dia",
};

/**
 * Ações que a organização pode tirar do anfitrião (`event_host`). `dashboard.read` fica sempre
 * (sem ela o anfitrião nem entra no painel do evento).
 */
export const HOST_CONFIGURABLE_ACTIONS = EVENT_ACTIONS.filter(
  (a): a is Exclude<EventAction, "dashboard.read"> => a !== "dashboard.read",
);
export type HostConfigurableAction = (typeof HOST_CONFIGURABLE_ACTIONS)[number];

/**
 * `event_settings` › `event.host_permissions` (privado; rota própria na organização, o PUT de
 * /settings do evento recusa). Guarda o que o anfitrião NÃO pode: chave ausente ou `deny`
 * vazio = pode tudo (padrão). Lista de negação para que ação nova nasça liberada, como hoje.
 */
export const HostPermissions = z.object({
  deny: z
    .array(z.enum(HOST_CONFIGURABLE_ACTIONS as unknown as [HostConfigurableAction]))
    .max(EVENT_ACTIONS.length)
    .default([])
    .transform((list) => [...new Set(list)]),
});
export type HostPermissions = z.infer<typeof HostPermissions>;

/**
 * Ação que depende de outra: sem ver, não dá para mexer. Negar a leitura ao anfitrião nega
 * também as escritas da mesma área (ver `withDependents`).
 */
export const ACTION_REQUIRES: Partial<Record<EventAction, HostConfigurableAction>> = {
  "invitations.write": "invitations.read",
  "gifts.write": "gifts.read",
  "orders.refund": "orders.read",
  "orders.reconcile": "orders.read",
  "messages.moderate": "messages.read",
  "settings.write": "settings.read",
  "reminders.write": "reminders.read",
  "content.write": "content.read",
  "tasks.write": "tasks.read",
  "vendors.write": "vendors.read",
  "budget.write": "budget.read",
  "schedule.write": "schedule.read",
};

/**
 * A lista de negação efetiva: a pedida mais o que depende de algo negado, sem repetição, na
 * ordem de HOST_CONFIGURABLE_ACTIONS. É o que a API grava e aplica.
 */
export function withDependents(deny: readonly HostConfigurableAction[]): HostConfigurableAction[] {
  const set = new Set<EventAction>(deny);
  return HOST_CONFIGURABLE_ACTIONS.filter((a) => {
    const needs = ACTION_REQUIRES[a];
    return set.has(a) || (needs !== undefined && set.has(needs));
  });
}

/** Ações por organização (`/api/admin/orgs/:orgId/*`). */
export const ORG_ACTIONS = [
  /** Ver a organização, seus eventos e o dashboard multievento. */
  "org.read",
  /** Criar evento pela UI. */
  "events.create",
  /** Convidar, remover e mudar o papel de membros da organização. */
  "team.manage",
  /** Convidar e remover anfitriões dos eventos e ajustar as permissões deles. */
  "hosts.manage",
  /** Fase 4: cadastrar, editar e arquivar fornecedores do catálogo da organização. */
  "vendors.manage",
  /** Fase 4: criar e editar modelos de tarefas. */
  "templates.manage",
] as const;
export const OrgAction = z.enum(ORG_ACTIONS);
export type OrgAction = z.infer<typeof OrgAction>;

/** Papel efetivo de quem acessa uma organização pelo painel (do mais forte ao mais fraco). */
export const ORG_ACCESS_ROLES = ["platform_admin", "org_owner", "org_member"] as const;
export type OrgAccessRole = (typeof ORG_ACCESS_ROLES)[number];

/** Papel efetivo de quem acessa um evento pelo painel (do mais forte ao mais fraco). */
export const EVENT_ACCESS_ROLES = [
  "platform_admin",
  "org_owner",
  "org_member",
  "event_host",
] as const;
export type EventAccessRole = (typeof EVENT_ACCESS_ROLES)[number];

export const ACCESS_ROLE_LABELS: Record<EventAccessRole, string> = {
  platform_admin: "Administração da plataforma",
  org_owner: "Dono da organização",
  org_member: "Membro da organização",
  event_host: "Anfitrião",
};

/* ------------------------------------------------------------------------ */
/* Rotas das permissões do anfitrião (frente C)                              */
/* ------------------------------------------------------------------------ */

/** PUT /api/admin/orgs/:orgId/events/:eventId/host-permissions */
export const HostPermissionsUpdate = HostPermissions;
export type HostPermissionsUpdate = HostPermissions;

/** GET /api/admin/orgs/:orgId/events/:eventId/host-permissions */
export interface HostPermissionsView {
  eventId: number;
  /** Ações negadas ao anfitrião neste evento (vazio = pode tudo). */
  deny: HostConfigurableAction[];
  /** Ações que a organização pode tirar (HOST_CONFIGURABLE_ACTIONS). */
  actions: readonly HostConfigurableAction[];
}

/**
 * GET /api/admin/events/:eventId/access: o que quem está logado pode fazer neste evento (o
 * painel esconde do menu e desabilita o que não pode; a API continua conferindo com 403).
 */
export interface EventAccessView {
  role: EventAccessRole;
  allowed: EventAction[];
}
