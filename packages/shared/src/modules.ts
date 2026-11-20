import { z } from "zod";
import { eventTypeOf } from "./event-types.ts";

/*
 * Módulos ligáveis por evento (`event_settings` › `event.modules`, público). Desligado:
 * some do menu e da home, a página do site dá 404 e as rotas públicas da API do módulo
 * também (`/api/e/:slug/gifts`, `/messages`, `/invitations`...). O painel continua
 * mostrando os dados já existentes.
 */
export const MODULES = ["gifts", "messages", "gallery", "godparents", "rsvp", "schedule"] as const;
export const ModuleId = z.enum(MODULES);
export type ModuleId = z.infer<typeof ModuleId>;

export const MODULE_LABELS: Record<ModuleId, string> = {
  gifts: "Lista de presentes",
  messages: "Mural de recados",
  gallery: "Galeria de fotos",
  godparents: "Padrinhos / corte",
  rsvp: "Confirmação de presença",
  schedule: "Programação",
};

/** Páginas e seções de cada módulo no site (para o menu e o 404). */
export const MODULE_ROUTES: Record<ModuleId, readonly string[]> = {
  gifts: ["/presentes"],
  messages: ["/recados"],
  gallery: ["/galeria"],
  godparents: ["/padrinhos"],
  rsvp: ["/confirmar", "/c"],
  schedule: [],
};

export const EventModules = z.object(
  Object.fromEntries(MODULES.map((m) => [m, z.boolean()])) as Record<ModuleId, z.ZodBoolean>,
);
export type EventModules = z.infer<typeof EventModules>;

/** O que está gravado pode ter só parte das chaves; o resto vem do padrão do tipo. */
export const EventModulesInput = EventModules.partial();
export type EventModulesInput = z.infer<typeof EventModulesInput>;

/** Padrão por tipo: tudo ligado, menos padrinhos/corte fora de casamento e 15 anos. */
export function defaultModules(type: string): EventModules {
  const t = eventTypeOf(type);
  return {
    gifts: true,
    messages: true,
    gallery: true,
    godparents: t === "wedding" || t === "fifteen",
    rsvp: true,
    schedule: true,
  };
}

/** Módulos finais do evento: padrão do tipo + o que foi gravado. */
export function modulesFor(type: string, stored?: EventModulesInput | null): EventModules {
  const out = defaultModules(type);
  for (const m of MODULES) {
    const v = stored?.[m];
    if (typeof v === "boolean") out[m] = v;
  }
  return out;
}

/** Módulo dono de um caminho do site ("/presentes/x" → "gifts"); null = sempre aberto. */
export function moduleOfPath(path: string): ModuleId | null {
  for (const m of MODULES) {
    for (const r of MODULE_ROUTES[m]) {
      if (path === r || path.startsWith(`${r}/`)) return m;
    }
  }
  return null;
}
