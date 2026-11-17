import type { giftOrders, gifts } from "@casamento/db";
import type { Env } from "../env.ts";
import type { Mailer, MailMessage } from "../mailer.ts";

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

/** Telegram via Bot API com `fetch` (sem dependência). Sem token/chat no .env, não faz nada. */
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

/** Aviso aos noivos: quem deu, o quê, quanto e o recado. */
export function buildCoupleEmail(to: string, order: OrderRow, gift: GiftRow): MailMessage {
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
    subject: `Presente recebido: ${what}`,
    text: lines.join("\n"),
    html: `<div style="font-family:Georgia,serif;color:#1b2a4a;max-width:520px">${lines
      .map((l) => (l ? `<p>${escapeHtml(l)}</p>` : ""))
      .join("")}</div>`,
  };
}

/** Agradecimento ao convidado. */
export function buildThanksEmail(order: OrderRow, gift: GiftRow, siteUrl: string): MailMessage {
  const first = order.buyerName.split(" ")[0] ?? order.buyerName;
  const link = `${siteUrl.replace(/\/$/, "")}/presentes/obrigado/${order.publicId}`;
  const lines = [
    `Oi, ${first}.`,
    `Recebemos o seu presente (${describeGift(order, gift)}, ${formatBRL(order.amountCents + order.feeCents)}). Obrigado pelo carinho.`,
    "",
    `O comprovante fica neste link: ${link}`,
    "",
    "Dani & Gustavo",
  ];
  return {
    to: order.buyerEmail,
    subject: "Presente enviado",
    text: lines.join("\n"),
    html: `<div style="font-family:Georgia,serif;color:#1b2a4a;max-width:520px">${lines
      .map((l) => (l ? `<p>${escapeHtml(l)}</p>` : ""))
      .join("")}</div>`,
  };
}

/** Pedido pago: agradece o convidado e avisa os noivos (e-mail e, se configurado, Telegram). */
export async function notifyPaid(
  deps: { env: Env; mailer: Mailer; notifier?: Notifier },
  order: OrderRow,
  gift: GiftRow,
): Promise<void> {
  const { env, mailer } = deps;
  const notifier = deps.notifier ?? createTelegramNotifier(env);
  const couple = [env.ADMIN_EMAIL_1, env.ADMIN_EMAIL_2].filter((e): e is string => Boolean(e));
  const tasks: Promise<void>[] = [
    mailer.send(buildThanksEmail(order, gift, env.SITE_URL)),
    ...couple.map((to) => mailer.send(buildCoupleEmail(to, order, gift))),
    notifier.telegram(
      `Presente recebido: ${describeGift(order, gift)}, ${formatBRL(order.amountCents + order.feeCents)}, de ${order.buyerName}.` +
        (order.message ? `\nRecado: ${order.message}` : ""),
    ),
  ];
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.error("[avisos] Falha num aviso de presente:", r.reason);
  }
}
