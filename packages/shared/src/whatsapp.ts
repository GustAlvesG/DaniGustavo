import { z } from "zod";

/*
 * Fase 7, frente D: WhatsApp por links prontos (docs/saas/fase-7.md). Sem API da Meta e sem
 * custo: a plataforma monta a mensagem e o link `https://wa.me/<telefone>?text=…`; o organizador
 * abre no próprio WhatsApp, envia e marca "enviado". Rotas em
 * `/api/admin/events/:eventId/whatsapp*` (whatsapp.send).
 *
 * Também da frente D: o aviso de limite de convidados por acompanhantes (o RSVP nunca é
 * recusado; a organização recebe e-mail e aviso no painel) em `/guest-limit`.
 */

export const WHATSAPP_TEMPLATE_KINDS = ["invite", "rsvp_reminder", "thanks", "day_notice"] as const;
export const WhatsappTemplateKind = z.enum(WHATSAPP_TEMPLATE_KINDS);
export type WhatsappTemplateKind = z.infer<typeof WhatsappTemplateKind>;

export const WHATSAPP_TEMPLATE_LABELS: Record<WhatsappTemplateKind, string> = {
  invite: "Convite",
  rsvp_reminder: "Lembrete de confirmação",
  thanks: "Agradecimento",
  day_notice: "Aviso do dia",
};

/**
 * Variáveis aceitas nos modelos, trocadas pela API ao montar a mensagem de cada convite.
 * `{link}` = link do convite (`/c/<token>`), `{prazo}` = prazo do RSVP.
 */
export const WHATSAPP_VARIABLES = ["{convite}", "{evento}", "{data}", "{link}", "{prazo}"] as const;

/** Textos padrão (sem linha em `whatsapp_templates`). `TODO(conteudo)`: revisar o tom. */
export const DEFAULT_WHATSAPP_TEMPLATES: Record<WhatsappTemplateKind, string> = {
  invite:
    "Olá, {convite}! Vocês são nossos convidados para {evento}, em {data}. Confirme a presença por aqui: {link}",
  rsvp_reminder:
    "Oi, {convite}! Ainda não recebemos sua confirmação para {evento}. Responda até {prazo}: {link}",
  thanks:
    "{convite}, obrigado por fazer parte de {evento}! Foi muito especial ter vocês com a gente.",
  day_notice: "Bom dia, {convite}! Hoje é o grande dia: {evento}. Os detalhes estão aqui: {link}",
};

export const WHATSAPP_BODY_MAX = 1000;

/** PUT /whatsapp/templates/:kind (texto vazio = volta ao padrão). */
export const WhatsappTemplateUpdate = z.object({
  body: z.string().trim().max(WHATSAPP_BODY_MAX),
});
export type WhatsappTemplateUpdate = z.infer<typeof WhatsappTemplateUpdate>;

export interface WhatsappTemplateView {
  kind: WhatsappTemplateKind;
  label: string;
  body: string;
  isDefault: boolean;
}

/** GET /whatsapp/templates */
export interface WhatsappTemplatesResponse {
  templates: WhatsappTemplateView[];
  variables: readonly string[];
}

/** Filtro da fila: quem ainda não recebeu este tipo, quem não respondeu o RSVP, todos. */
export const WHATSAPP_QUEUE_FILTERS = ["not_sent", "pending_rsvp", "confirmed", "all"] as const;
export type WhatsappQueueFilter = (typeof WHATSAPP_QUEUE_FILTERS)[number];

/** Um convite na fila de envio (GET /whatsapp/queue?kind=…&filter=…). */
export interface WhatsappQueueItem {
  invitationId: number;
  label: string;
  /** Telefone de contato do convite (ou do primeiro convidado com telefone); null = sem telefone. */
  phone: string | null;
  /** Link wa.me pronto (null sem telefone válido). */
  waUrl: string | null;
  message: string;
  lastSentAt: string | null;
  sends: number;
}

export interface WhatsappQueueResponse {
  kind: WhatsappTemplateKind;
  items: WhatsappQueueItem[];
  /** Convites sem telefone (fora de `items` com waUrl). */
  withoutPhone: number;
}

/** POST /whatsapp/sends: marca "enviado" (um ou vários convites de uma vez). */
export const WhatsappSendMark = z.object({
  kind: WhatsappTemplateKind,
  invitationIds: z.array(z.number().int().positive()).min(1).max(500),
});
export type WhatsappSendMark = z.infer<typeof WhatsappSendMark>;

/**
 * Telefone brasileiro para o wa.me: só dígitos, com DDI 55. Aceita "(11) 98765-4321",
 * "+55 11 98765-4321", "011987654321". Inválido → null.
 */
export function waPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return null;
  return d;
}

/** Link `https://wa.me/<telefone>?text=<mensagem>`. */
export function waLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Troca as variáveis do modelo (as desconhecidas ficam como estão). */
export function renderWhatsappTemplate(
  body: string,
  vars: Partial<Record<string, string>>,
): string {
  return body.replace(/\{(\w+)\}/g, (all, name: string) => vars[name] ?? all);
}

/* ------------------- limite de convidados (acompanhantes) ------------------- */

/**
 * GET /guest-limit (dashboard.read): pessoas do evento contra o limite do plano. Acompanhante
 * criado pelo RSVP conta; o RSVP nunca é recusado — passou do limite, a organização recebe um
 * e-mail (uma vez por estouro) e o painel mostra o aviso.
 */
export interface GuestLimitStatus {
  /** Pessoas (linhas de `guests`) no evento. */
  used: number;
  /** null = sem limite (sem assinatura, plano interno ou plano sem limite). */
  limit: number | null;
  over: boolean;
  /** Quando o estouro foi avisado por e-mail (null = não houve). */
  notifiedAt: string | null;
}
