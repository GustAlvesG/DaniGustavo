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

export const PAYMENT_PROVIDERS = ["simulado", "asaas"] as const;
export const PaymentProviderName = z.enum(PAYMENT_PROVIDERS);
export type PaymentProviderName = z.infer<typeof PaymentProviderName>;

/** Limites da contribuição de valor livre. */
export const OPEN_AMOUNT_MIN_CENTS = 1_000;
export const OPEN_AMOUNT_MAX_CENTS = 1_000_000;
/** Máximo de cotas num único pedido. */
export const MAX_QUANTITY = 20;
/** Minutos que um pedido pendente segura as cotas (o Pix expira junto). */
export const ORDER_HOLD_MINUTES = 30;

/** Só os dígitos do CPF ("123.456.789-09" → "12345678909"). */
export const cpfDigits = (value: string) => value.replace(/\D/g, "");

/** CPF válido pelos dígitos verificadores (rejeita sequências como 111.111.111-11). */
export function isValidCpf(value: string): boolean {
  const d = cpfDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

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
  /** O provedor exige o CPF de quem paga (Asaas): o formulário pede o campo. */
  requiresCpf: z.boolean().default(false),
});
export type GiftsResponse = z.infer<typeof GiftsResponse>;

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/**
 * Cartão do modo simulado: o navegador manda um "token" com os 4 últimos dígitos, nunca o
 * número. No Asaas o cartão é digitado na fatura hospedada (veja CardCheckoutRequest).
 */
export const CardPayment = z.object({
  token: z.string().min(1, { error: "Cartão sem token. Preencha os dados de novo." }).max(255),
  /** Bandeira (ex.: "visa", "master"). */
  paymentMethodId: z.string().min(1).max(40),
  paymentType: z.enum(["credit_card", "debit_card"]).default("credit_card"),
  installments: z.number().int().min(1).max(12).default(1),
  /** Soma a taxa do cartão ao valor ("Quero cobrir a taxa"). */
  coverFee: z.boolean().default(false),
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
  /**
   * CPF de quem paga. O Asaas exige o documento para gerar a cobrança; a API repassa ao
   * Asaas e não guarda no banco nem nos logs. Opcional no modo simulado.
   */
  buyerCpf: z.preprocess(
    (v) => (typeof v === "string" ? (cpfDigits(v) === "" ? undefined : cpfDigits(v)) : v),
    z.string().refine(isValidCpf, { error: "CPF inválido. Confira os 11 números." }).optional(),
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
  /** PNG do QR em base64 (Asaas); null no modo simulado. */
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
    /** Chave pública para tokenizar no navegador (nenhum provedor atual usa: sempre null). */
    publicKey: z.string().nullable(),
    feePercent: z.number().nonnegative(),
    /**
     * "form": formulário na nossa tela (simulado). "hosted": o cartão é digitado na página
     * segura do provedor (fatura do Asaas) e os dados nunca passam pelo nosso servidor.
     */
    checkout: z.enum(["form", "hosted"]).default("form"),
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

/** Corpo de POST /api/orders/{publicId}/card-checkout (cartão na página do provedor). */
export const CardCheckoutRequest = z.object({
  /** Soma a taxa do cartão ao valor ("Quero cobrir a taxa"). */
  coverFee: z.boolean().default(false),
});
export type CardCheckoutRequest = z.input<typeof CardCheckoutRequest>;

/** Resposta: para onde mandar a pessoa digitar o cartão. */
export const CardCheckoutResponse = z.object({ url: z.url() });
export type CardCheckoutResponse = z.infer<typeof CardCheckoutResponse>;
