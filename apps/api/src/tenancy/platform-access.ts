import type { PlatformAction } from "@casamento/shared";
import type { MiddlewareHandler } from "hono";
import type { AdminEnv } from "../admin/context.ts";
import { routeNotFound } from "../errors.ts";

/*
 * Fase 6: painel da plataforma (`/api/admin/platform/*`). Só o platform admin entra; os demais
 * recebem o 404 de rota inexistente (como evento/organização sem vínculo: não descobrem que o
 * painel existe). Leitura entre organizações nas rotas daqui vai dentro de crossEvent().
 */

/** Matriz ação → papel. Hoje só existe um papel de plataforma; fica explícita como as outras. */
export const PLATFORM_PERMISSIONS: Record<PlatformAction, readonly ["platform_admin"]> = {
  "platform.read": ["platform_admin"],
  "platform.orgs.manage": ["platform_admin"],
  "platform.plans.manage": ["platform_admin"],
  "platform.subscriptions.manage": ["platform_admin"],
  "platform.templates.manage": ["platform_admin"],
};

/** Depois de requireSession: quem não é platform admin → 404 de rota. */
export function requirePlatformAdmin(): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    if (c.get("user").platformRole !== "admin") return routeNotFound(c);
    await next();
  };
}

/**
 * Declara a ação da rota (como requirePermission/requireOrgPermission). Com um papel só, quem
 * passou de requirePlatformAdmin pode tudo; a matriz existe para um papel novo (ex.: suporte).
 */
export function requirePlatformPermission(action: PlatformAction): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    if (c.get("user").platformRole !== "admin" || !PLATFORM_PERMISSIONS[action]) {
      return routeNotFound(c);
    }
    await next();
  };
}
