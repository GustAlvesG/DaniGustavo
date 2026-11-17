import { z } from "zod";

/*
 * Contratos da lista de presentes e do pagamento (Fase 4). Dinheiro sempre em
 * centavos (inteiro). O pedido é identificado pelo `publicId` (ULID), nunca
 * pelo id do banco.
 */

export const ORDER_STATUSES = ["pending", "paid", "expired", "failed", "refunded"] as const;
export const OrderStatus = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const PAYMENT_METHODS = ["pix", "card"] as const;
export const PaymentMethod = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const PAYMENT_PROVIDERS = ["simulado", "mercadopago"] as const;
export const PaymentProviderName = z.enum(PAYMENT_PROVIDERS);
export type PaymentProviderName = z.infer<typeof PaymentProviderName>;

/** Limites da contribuição de valor livre. */
export const OPEN_AMOUNT_MIN_CENTS = 1_000;
export const OPEN_AMOUNT_MAX_CENTS = 1_000_000;
/** Máximo de cotas num único pedido. */
export const MAX_QUANTITY = 20;
/** Minutos que um pedido pendente segura as cotas (o Pix expira junto). */
export const ORDER_HOLD_MINUTES = 30;

/** Taxa do cartão em centavos para um valor e um percentual (arredonda para cima). */
export function cardFeeCents(amountCents: number, percent: number): number {
  if (!(percent > 0)) return 0;
  // Em centésimos de ponto percentual (4,98% → 498) para não errar por ponto flutuante.
  const basisPoints = Math.round(percent * 100);
  return Math.ceil((amountCents * basisPoints) / 10_000);
}

export const GiftCategory = z.object({ slug: z.string(), label: z.string() });
export type GiftCategory = z.infer<typeof GiftCategory>;

export const Gift = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  image: z.string().nullable(),
  /** Preço de uma cota; no valor livre, o valor sugerido. */
  priceCents: z.number().int().nonnegative(),
  openAmount: z.boolean(),
  quotaTotal: z.number().int().positive(),
  /** Cotas ainda disponíveis (descontando as reservadas por pedidos pendentes). */
  quotaLeft: z.number().int().nonnegative(),
  category: z.string(),
});
export type Gift = z.infer<typeof Gift>;

/** Resposta de GET /api/gifts. */
export const GiftsResponse = z.object({
  gifts: z.array(Gift),
  categories: z.array(GiftCategory),
  cardFeePercent: z.number().nonnegative(),
});
export type GiftsResponse = z.infer<typeof GiftsResponse>;

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Dados do cartão já tokenizado no navegador. O número do cartão nunca chega aqui. */
export const CardPayment = z.object({
  token: z.string().min(1, { error: "Cartão sem token. Preencha os dados de novo." }).max(255),
  /** Bandeira (ex.: "visa", "master"), devolvida pelo SDK do Mercado Pago. */
  paymentMethodId: z.string().min(1).max(40),
  paymentType: z.enum(["credit_card", "debit_card"]).default("credit_card"),
  installments: z.number().int().min(1).max(12).default(1),
  /** Soma a taxa do cartão ao valor ("Quero cobrir a taxa"). */
  coverFee: z.boolean().default(false),
  /** Documento do titular (CPF), exigido pelo Mercado Pago. */
  identification: z
    .object({
      type: z.string().min(1).max(10),
      number: z.string().regex(/^\d{11,14}$/, { error: "CPF inválido. Use só os 11 números." }),
    })
    .optional(),
});
export type CardPayment = z.infer<typeof CardPayment>;

/** Corpo de POST /api/orders. */
export const CreateOrderRequest = z.object({
  giftSlug: z.string().min(1).max(191),
  quantity: z
    .number()
    .int()
    .min(1, { error: "Escolha pelo menos uma cota." })
    .max(MAX_QUANTITY, { error: `Escolha até ${MAX_QUANTITY} cotas por vez.` })
    .default(1),
  /** Só no valor livre: quanto a pessoa quer dar. */
  amountCents: z
    .number()
    .int()
    .min(OPEN_AMOUNT_MIN_CENTS, { error: "O valor mínimo é R$ 10,00." })
    .max(OPEN_AMOUNT_MAX_CENTS, { error: "O valor máximo é R$ 10.000,00." })
    .optional(),
  buyerName: z
    .string()
    .trim()
    .min(2, { error: "Informe seu nome." })
    .max(120, { error: "Nome: use até 120 caracteres." }),
  buyerEmail: z
    .email({ error: "E-mail inválido. Confira se tem @ e o domínio." })
    .max(191, { error: "E-mail: use até 191 caracteres." }),
  message: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(500, { error: "Recado: use até 500 caracteres." }).optional(),
  ),
  /** Autoriza o recado a ir para o mural (depois da aprovação dos noivos). */
  showOnWall: z.boolean().default(false),
  /** Pix gera a cobrança na hora; cartão exige `card` (dados tokenizados). */
  method: PaymentMethod.default("pix"),
  card: CardPayment.optional(),
  /** Honeypot. */
  website: z.string().optional(),
});
export type CreateOrderRequest = z.input<typeof CreateOrderRequest>;

export const PixCharge = z.object({
  /** Código copia e cola. */
  code: z.string(),
  /** PNG do QR em base64 (Mercado Pago); null no modo simulado. */
  qrImageBase64: z.string().nullable(),
  ticketUrl: z.string().nullable(),
});
export type PixCharge = z.infer<typeof PixCharge>;

/** Resposta de GET /api/orders/{publicId} (e de POST /api/orders). */
export const OrderView = z.object({
  publicId: z.string().length(26),
  status: OrderStatus,
  statusDetail: z.string().nullable(),
  method: PaymentMethod,
  provider: PaymentProviderName,
  gift: z.object({ slug: z.string(), title: z.string(), openAmount: z.boolean() }),
  quantity: z.number().int().positive(),
  amountCents: z.number().int().nonnegative(),
  feeCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  buyerName: z.string(),
  message: z.string().nullable(),
  expiresAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  /** Cobrança Pix enquanto o pedido está pendente. */
  pix: PixCharge.nullable(),
  card: z.object({
    /** Chave pública do Mercado Pago para tokenizar no navegador; null no simulado. */
    publicKey: z.string().nullable(),
    feePercent: z.number().nonnegative(),
  }),
});
export type OrderView = z.infer<typeof OrderView>;

/** Corpo de POST /api/orders/{publicId}/card. */
export const PayWithCardRequest = CardPayment;
export type PayWithCardRequest = z.input<typeof PayWithCardRequest>;

/** Resposta do pagamento com cartão. */
export const PayWithCardResponse = z.object({
  outcome: z.enum(["approved", "rejected", "pending"]),
  /** Mensagem para a pessoa (recusa: o que houve e o que fazer). */
  message: z.string(),
  order: OrderView,
});
export type PayWithCardResponse = z.infer<typeof PayWithCardResponse>;
