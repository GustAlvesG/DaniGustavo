import {
  and,
  byEvent,
  eq,
  eventMembers,
  eventSettings,
  organizationMembers,
  user,
  type Database,
  type giftOrders,
  type gifts,
} from "@casamento/db";
import type { Env } from "../env.ts";
import type { Mailer, MailMessage } from "../mailer.ts";
import { resolverFor, type EventResolver } from "../tenancy/resolver.ts";
import type { EventCtx } from "../tenancy/types.ts";
import { eventBaseUrl } from "../tenancy/urls.ts";

type OrderRow = typeof giftOrders.$inferSelect;
type GiftRow = typeof gifts.$inferSelect;

/** Envio ao Telegram, injetável para os testes. */
export interface Notifier {
  telegram(text: string): Promise<void>;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (cents: number) => brl.format(cents / 100).replace(/\s/g, " ");

const escapeHtml = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * Telegram via Bot API com `fetch` (sem dependência). Sem token/chat no .env, não faz nada.
 * É o canal de operação da plataforma: recebe os avisos de todos os eventos (quem envia
 * prefixa a mensagem com o nome do evento).
 */
export function createTelegramNotifier(env: Env, doFetch: typeof fetch = fetch): Notifier {
  return {
    async telegram(text) {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
      const res = await doFetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) throw new Error(`Telegram respondeu ${res.status}: ${await res.text()}`);
    },
  };
}

function describeGift(order: OrderRow, gift: GiftRow): string {
  if (gift.openAmount) return gift.title;
  return order.quantity > 1 ? `${gift.title} (${order.quantity} cotas)` : gift.title;
}

/** Aviso aos anfitriões: quem deu, o quê, quanto e o recado. */
export function buildCoupleEmail(
  to: string,
  order: OrderRow,
  gift: GiftRow,
  ev: Pick<EventCtx, "name">,
): MailMessage {
  const total = formatBRL(order.amountCents + order.feeCents);
  const what = describeGift(order, gift);
  const method = order.method === "pix" ? "Pix" : "cartão";
  const lines = [
    `${order.buyerName} deu um presente: ${what}.`,
    `Valor: ${total} no ${method}${order.feeCovered ? " (cobriu a taxa do cartão)" : ""}.`,
    `E-mail: ${order.buyerEmail}`,
  ];
  if (order.message) lines.push("", "Recado:", order.message);
  if (order.message && order.showOnWall)
    lines.push("", "Pode ir para o mural depois da aprovação.");
  return {
    to,
    fromName: ev.name,
    subject: `Presente recebido: ${what}`,
    text: lines.join("\n"),
    html: `<div style="font-family:Georgia,serif;color:#1b2a4a;max-width:520px">${lines
      .map((l) => (l ? `<p>${escapeHtml(l)}</p>` : ""))
      .join("")}</div>`,
  };
}

/** Agradecimento ao convidado. */
export function buildThanksEmail(
  order: OrderRow,
  gift: GiftRow,
  siteUrl: string,
  ev: Pick<EventCtx, "name">,
): MailMessage {
  const first = order.buyerName.split(" ")[0] ?? order.buyerName;
  const link = `${siteUrl.replace(/\/$/, "")}/presentes/obrigado/${order.publicId}`;
  const lines = [
    `Oi, ${first}.`,
    `Recebemos o seu presente (${describeGift(order, gift)}, ${formatBRL(order.amountCents + order.feeCents)}). Obrigado pelo carinho.`,
    "",
    `O comprovante fica neste link: ${link}`,
    "",
    ev.name,
  ];
  return {
    to: order.buyerEmail,
    fromName: ev.name,
    subject: "Presente enviado",
    text: lines.join("\n"),
    html: `<div style="font-family:Georgia,serif;color:#1b2a4a;max-width:520px">${lines
      .map((l) => (l ? `<p>${escapeHtml(l)}</p>` : ""))
      .join("")}</div>`,
  };
}

const ORG_OWNERS_KEY = "notify.org_owners";

/**
 * Quem recebe os avisos do evento: os anfitriões (event_members) e, quando a configuração
 * privada `notify.org_owners` é true, os owners da organização. Sem a configuração, os owners
 * entram só se o evento não tiver nenhum anfitrião (para o aviso não se perder).
 */
export async function eventNotifyRecipients(ev: EventCtx, db: Database): Promise<string[]> {
  const [hosts, [setting]] = await Promise.all([
    db
      .select({ email: user.email })
      .from(eventMembers)
      .innerJoin(user, eq(user.id, eventMembers.userId))
      .where(byEvent(eventMembers, ev)),
    db
      .select({ value: eventSettings.value })
      .from(eventSettings)
      .where(and(byEvent(eventSettings, ev), eq(eventSettings.key, ORG_OWNERS_KEY))),
  ]);
  const withOwners = typeof setting?.value === "boolean" ? setting.value : hosts.length === 0;
  const owners = withOwners
    ? await db
        .select({ email: user.email })
        .from(organizationMembers)
        .innerJoin(user, eq(user.id, organizationMembers.userId))
        .where(
          and(
            eq(organizationMembers.organizationId, ev.orgId),
            eq(organizationMembers.role, "owner"),
          ),
        )
    : [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const { email } of [...hosts, ...owners]) {
    const key = email.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      emails.push(email.trim());
    }
  }
  return emails;
}

/** Pedido pago: agradece o convidado, avisa os anfitriões do evento e o Telegram da plataforma. */
export async function notifyPaid(
  deps: {
    env: Env;
    db: Database;
    mailer: Mailer;
    notifier?: Notifier;
    eventResolver?: EventResolver;
  },
  ev: EventCtx,
  order: OrderRow,
  gift: GiftRow,
): Promise<void> {
  const { env, db, mailer } = deps;
  const notifier = deps.notifier ?? createTelegramNotifier(env);
  const baseUrl = await eventBaseUrl(ev, { env, resolver: resolverFor(db, deps.eventResolver) });
  const hosts = await eventNotifyRecipients(ev, db).catch((err: unknown) => {
    console.error("[avisos] Falha ao buscar os destinatários do evento:", err);
    return [] as string[];
  });
  const tasks: Promise<void>[] = [
    mailer.send(buildThanksEmail(order, gift, baseUrl, ev)),
    ...hosts.map((to) => mailer.send(buildCoupleEmail(to, order, gift, ev))),
    notifier.telegram(
      `[${ev.name}] Presente recebido: ${describeGift(order, gift)}, ${formatBRL(order.amountCents + order.feeCents)}, de ${order.buyerName}.` +
        (order.message
          ? `
Recado: ${order.message}`
          : ""),
    ),
  ];
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.error("[avisos] Falha num aviso de presente:", r.reason);
  }
}
