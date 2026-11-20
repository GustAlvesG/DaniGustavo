import { z } from "zod";
import type { EventAccessRole, OrgAccessRole } from "./permissions.ts";

/*
 * Contratos comuns do painel da organização (Fase 3, docs/saas/fase-3.md): regras de entrada
 * e o /me. Os de cada frente ficam em `org-events.ts` (A), `team.ts` (B) e `permissions.ts` (C).
 */

/* ------------------------------------------------------------------------ */
/* Regras de entrada comuns                                                  */
/* ------------------------------------------------------------------------ */

/** Slug de evento/organização: minúsculas, números e hífens, até 64 (o mesmo da CLI). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX = 64;
/** Host como chega no header Host: minúsculo, com porta opcional. */
export const HOST_PATTERN = /^[a-z0-9.-]+(:\d+)?$/;
export const HOST_MAX = 191;
/** Senha mínima: a mesma do Better Auth (`minPasswordLength` em apps/api/src/auth.ts). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
/** Validade do convite da equipe/anfitrião. */
export const TEAM_INVITE_TTL_DAYS = 7;

export const EventSlug = z
  .string()
  .trim()
  .toLowerCase()
  .max(SLUG_MAX, { error: `Endereço do evento: até ${SLUG_MAX} caracteres.` })
  .regex(SLUG_PATTERN, {
    error: "Endereço do evento: use letras minúsculas, números e hífens (ex.: ana-e-bruno).",
  });

export const EventHost = z
  .string()
  .trim()
  .toLowerCase()
  .max(HOST_MAX, { error: "Domínio: até 191 caracteres." })
  .regex(HOST_PATTERN, { error: "Domínio inválido. Use algo como anaebruno.com.br." });

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "E-mail inválido." }).max(191, { error: "E-mail longo demais." }));

/** "2027-04-10" */
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida." });
/** "16:00" */
export const LocalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Horário inválido." });

export const TimeZone = z
  .string()
  .min(3)
  .max(64)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { error: "Fuso horário inválido." },
  );

/**
 * Data e hora "de parede" num fuso → ISO com offset ("2027-04-10T16:00:00-03:00"), sem
 * dependência: mede o offset do fuso naquele instante com Intl. Usado pela API ao criar evento
 * pela UI (a CLI já recebe o ISO com offset).
 */
export function localDateTimeToIso(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(new Date(instant))
        .map((p) => [p.type, p.value]),
    );
    const wall = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return Math.round((wall - instant) / 60_000);
  };
  // Duas passadas: o offset no instante aproximado e, de novo, no instante corrigido (horário de verão).
  let offset = offsetAt(asUtc);
  offset = offsetAt(asUtc - offset * 60_000);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}

/* ------------------------------------------------------------------------ */
/* /me                                                                       */
/* ------------------------------------------------------------------------ */

/** Organização que o usuário abre no painel (platform admin vê todas). */
export interface MeOrganization {
  id: number;
  slug: string;
  name: string;
  status: "active" | "suspended";
  role: OrgAccessRole;
}

/** Evento que o usuário abre no painel (como já era na Fase 1). */
export interface MeEvent {
  id: number;
  slug: string;
  orgId: number;
  orgName: string;
  name: string;
  type: string;
  status: "draft" | "active" | "archived";
  timezone: string;
  startsAt: string | null;
  role: EventAccessRole;
}

/** GET /api/admin/me */
export interface MeResponse {
  user: { id: string; name: string; email: string; platformRole: string | null };
  events: MeEvent[];
  /** Fase 3: organizações em que o usuário é owner/member (todas, para platform admin). */
  organizations: MeOrganization[];
}
