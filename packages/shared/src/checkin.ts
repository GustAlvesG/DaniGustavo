import { z } from "zod";

/*
 * Fase 7, frente A: check-in pela portaria (docs/saas/fase-7.md).
 *
 * Painel: `/api/admin/events/:eventId/checkin*` (checkin.read / checkin.manage).
 * Portaria (sem conta): página `/portaria/#<token>` no host da API; API em `/api/checkin/*`
 * (isenta de X-Web-Key: chamada do navegador, sem cookie, com `Authorization: Bearer <sessão>`).
 * A portaria vê só o nome do convite, as pessoas confirmadas, o aviso de acesso e a mesa —
 * nunca telefone, e-mail ou restrição alimentar (dado de saúde).
 */

/** PIN da portaria: só dígitos. */
export const CHECKIN_PIN_LENGTH = 6;
/** Validade padrão do link (horas a partir de agora) e máxima. */
export const CHECKIN_LINK_DEFAULT_HOURS = 48;
export const CHECKIN_LINK_MAX_HOURS = 24 * 14;
/** Sessão da portaria depois do PIN (horas). */
export const CHECKIN_SESSION_HOURS = 12;
/** PIN errado: depois de N tentativas no link, bloqueia por alguns minutos. */
export const CHECKIN_PIN_MAX_FAILURES = 5;
export const CHECKIN_PIN_LOCK_MINUTES = 15;
/** Intervalo do polling da contagem na portaria e no painel (ms). */
export const CHECKIN_POLL_MS = 5_000;

export const CheckinPin = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${CHECKIN_PIN_LENGTH}}$`), {
    error: `O PIN tem ${CHECKIN_PIN_LENGTH} números.`,
  });

/* ---------------------------- painel ---------------------------- */

/** POST /checkin/links */
export const CheckinLinkInput = z.object({
  label: z.string().trim().min(1, { error: "Dê um nome ao link." }).max(64),
  /** Horas de validade a partir de agora (padrão CHECKIN_LINK_DEFAULT_HOURS). */
  hours: z.number().int().min(1).max(CHECKIN_LINK_MAX_HOURS).default(CHECKIN_LINK_DEFAULT_HOURS),
});
export type CheckinLinkInput = z.infer<typeof CheckinLinkInput>;

export interface CheckinLinkView {
  id: number;
  label: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  /** Bloqueado por PIN errado até (null = não). */
  lockedUntil: string | null;
  createdAt: string;
  /** "active" | "expired" | "revoked" (calculado na API). */
  status: "active" | "expired" | "revoked";
}

/** Resposta do POST /checkin/links: link e PIN aparecem só aqui, uma vez. */
export interface CheckinLinkCreated {
  link: CheckinLinkView;
  /** URL completa da portaria (`<API>/portaria/#<token>`). */
  url: string;
  pin: string;
}

export interface CheckinTotals {
  /** Pessoas confirmadas (guests.rsvp_status = confirmed). */
  expectedPeople: number;
  arrivedPeople: number;
  /** Convites com pelo menos uma pessoa confirmada. */
  expectedInvitations: number;
  /** Convites com chegada (parcial ou completa). */
  arrivedInvitations: number;
}

/** Marcação recente na lista do painel (sem contato nem saúde). */
export interface CheckinRecentArrival extends CheckinArrivalView {
  /** Referência opaca do convite (para desfazer ou abrir de novo). */
  ref: string;
  invitationLabel: string;
}

/** GET /checkin */
export interface CheckinOverview {
  totals: CheckinTotals;
  links: CheckinLinkView[];
  /** Últimas marcações (as desfeitas também, com `undoneAt`), da mais nova para a mais antiga. */
  recent: CheckinRecentArrival[];
}

/** Quantas marcações recentes o painel recebe. */
export const CHECKIN_RECENT_LIMIT = 50;
/** Busca por nome: mínimo de letras e máximo de convites devolvidos. */
export const CHECKIN_SEARCH_MIN = 2;
export const CHECKIN_SEARCH_MAX_RESULTS = 20;

/** Uma marcação de chegada (lista do painel e "desfazer" da portaria). */
export interface CheckinArrivalView {
  id: number;
  people: number;
  at: string;
  /** "Portaria principal" (link) ou nome de quem marcou no painel. */
  by: string;
  undoneAt: string | null;
}

/** Convite como a portaria e o painel do dia veem (sem contato nem saúde). */
export interface CheckinInvitationView {
  /** Referência opaca do convite para as escritas da portaria (nunca o token do convite). */
  ref: string;
  label: string;
  /** Pessoas confirmadas (nomes) — a portaria confere por nome. */
  people: { name: string; isChild: boolean; table: string | null }[];
  confirmed: number;
  arrived: number;
  /** Aviso da portaria (`invitations.access_note`). */
  accessNote: string | null;
  arrivals: CheckinArrivalView[];
}

/** POST /checkin/arrivals (painel) e POST /api/checkin/arrivals (portaria). */
export const CheckinArrivalInput = z.object({
  ref: z.string().trim().min(1).max(64),
  /** Quantas pessoas do convite chegaram agora (parcial permitido). */
  people: z.number().int().min(1).max(100),
});
export type CheckinArrivalInput = z.infer<typeof CheckinArrivalInput>;

export interface CheckinArrivalResult {
  invitation: CheckinInvitationView;
  totals: CheckinTotals;
}

/* --------------------------- portaria --------------------------- */

/** POST /api/checkin/session */
export const CheckinSessionInput = z.object({
  token: z.string().trim().min(16).max(128),
  pin: CheckinPin,
});
export type CheckinSessionInput = z.infer<typeof CheckinSessionInput>;

export interface CheckinSessionResult {
  /** Enviar em `Authorization: Bearer <session>`. */
  session: string;
  expiresAt: string;
  event: { name: string; startsAt: string | null; timezone: string };
  linkLabel: string;
}

/**
 * GET /api/checkin/lookup?code=… (código lido do QR: a URL do convite `/c/<token>` ou o token)
 * ou ?q=… (busca por nome do convite/pessoa, mínimo 2 letras). Até 20 convites.
 */
export interface CheckinLookupResult {
  invitations: CheckinInvitationView[];
}

/** Extrai o token do convite do texto lido no QR ("https://host/c/<token>" ou o próprio token). */
export function invitationTokenFromCode(code: string): string | null {
  const text = code.trim();
  const m = /(?:^|\/c\/)([0-9A-HJKMNP-TV-Z]{26})(?:[/?#].*)?$/i.exec(text);
  return m ? m[1]!.toUpperCase() : null;
}
