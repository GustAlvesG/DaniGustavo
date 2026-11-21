import {
  accountRequestBody,
  accountStatusFromAsaas,
  parseAccountCreated,
  parseAsaasAccountWebhook,
  scrubProviderText,
  splitFromPayment,
  splitRequestBody,
  type AsaasAccountDocuments,
  type AsaasAccountStatus,
  type AsaasSplit,
} from "./asaas-accounts.ts";
import {
  fromAmount,
  parsePaymentEvent,
  PaymentProviderError,
  toAmount,
  verifyWebhookToken,
  type AccountCredentials,
  type CardCheckoutInput,
  type ChargeSnapshot,
  type PaymentProvider,
  type PixChargeInput,
  type ProviderStatus,
  type WebhookRequest,
} from "./provider.ts";

/*
 * Asaas, API v3 (docs.asaas.com), com `fetch` direto: são poucas chamadas REST e assim os
 * testes trocam o `fetch` por respostas gravadas. Autenticação pelo header `access_token`.
 *
 * - Pix: cliente (o Asaas exige CPF) → cobrança `billingType: PIX` → `/pixQrCode` (imagem em
 *   base64 + copia e cola). O QR do Asaas vale muito além dos nossos 30 minutos, então a API
 *   apaga a cobrança quando o pedido expira.
 * - Cartão: cobrança `billingType: CREDIT_CARD` e a pessoa paga na fatura hospedada do Asaas
 *   (`invoiceUrl`). O número do cartão nunca passa pelo nosso servidor.
 * - Webhook: o Asaas manda o token cadastrado no header `asaas-access-token`; o status vem
 *   sempre de um GET na cobrança, nunca do corpo do aviso.
 *
 * O CPF só atravessa esta camada a caminho do Asaas: não é gravado nem logado.
 *
 * Fase 5 (subcontas): a conta principal cria as subcontas (`createSubaccount`, POST /accounts,
 * já com o webhook de cada uma); `forAccount(creds)` devolve este mesmo provedor falando com a
 * `apiKey` da subconta (mesmas URLs: cliente, cobrança, QR, estorno e exclusão ficam na conta
 * que recebe) e só ela consulta a situação cadastral (`getAccountStatus`). O split para a
 * carteira da plataforma vai no corpo da cobrança. A chave da subconta só vive em memória,
 * dentro desta closure; nenhum erro ou `raw` a carrega.
 */

export type AsaasEnvironment = "sandbox" | "producao";

export const ASAAS_URLS: Record<AsaasEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
};

/** Ambiente pelo prefixo da chave ($aact_hmlg_ = sandbox, $aact_prod_ = produção). */
export function asaasEnvFromKey(key: string): AsaasEnvironment | null {
  if (key.startsWith("$aact_hmlg_")) return "sandbox";
  if (key.startsWith("$aact_prod_")) return "producao";
  return null;
}

export interface AsaasOptions {
  apiKey: string;
  environment: AsaasEnvironment;
  webhookToken: string;
  /** Sobrescreve a URL base (testes). */
  apiUrl?: string;
  fetch?: typeof fetch;
  /** Relógio (testes): define o vencimento das cobranças. */
  now?: () => Date;
}

/** Partes da cobrança (payment) do Asaas que usamos. */
export interface AsaasPayment {
  object?: string;
  id: string;
  customer?: string;
  status: string;
  billingType?: string;
  value?: number;
  externalReference?: string | null;
  invoiceUrl?: string | null;
  deleted?: boolean;
  /** Fase 5: repasses da cobrança. */
  split?: AsaasSplit[] | null;
}

interface AsaasList<T> {
  object?: "list";
  hasMore?: boolean;
  data: T[];
}

/**
 * Status da cobrança → nosso vocabulário. Confirmada/recebida = pago (no cartão o dinheiro
 * cai 30 dias depois, mas a compra está aprovada). Estorno pedido ou em andamento já conta
 * como devolvido. Chargeback não desfaz o presente sozinho (os noivos decidem no painel).
 */
export function mapAsaasStatus(payment: Pick<AsaasPayment, "status" | "deleted">): ProviderStatus {
  if (payment.deleted) return "cancelled";
  switch (payment.status) {
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
    case "DUNNING_RECEIVED":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "approved";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
      return "refunded";
    case "OVERDUE":
      return "expired";
    default:
      return "pending"; // PENDING, AWAITING_RISK_ANALYSIS, DUNNING_REQUESTED
  }
}

export function snapshotFromPayment(
  payment: AsaasPayment,
  pix: ChargeSnapshot["pix"] = null,
): ChargeSnapshot {
  const status = mapAsaasStatus(payment);
  const isCard = payment.billingType === "CREDIT_CARD" || payment.billingType === "DEBIT_CARD";
  return {
    providerOrderId: payment.id,
    externalReference: payment.externalReference ?? "",
    status,
    statusDetail: (payment.deleted ? "DELETED" : payment.status).toLowerCase().slice(0, 64),
    method: isCard ? "card" : "pix",
    paymentId: payment.id,
    amountCents: fromAmount(payment.value),
    pix: status === "pending" ? pix : null,
    checkoutUrl: payment.invoiceUrl ?? null,
    split: splitFromPayment(payment.split),
    raw: payment,
  };
}

/** Data (AAAA-MM-DD) de amanhã em São Paulo: vencimento que não vira "atrasada" à meia-noite. */
export function dueDate(now: Date): string {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(tomorrow);
}

/** Item de erro do Asaas (`errors[]`). */
export interface AsaasErrorItem {
  code: string | undefined;
  description: string | undefined;
}

/**
 * Resposta 4xx/5xx do Asaas. `details` (herdado) e `errors` têm só códigos e descrições
 * (descrições sem documento, e-mail ou telefone); nada do corpo enviado nem a chave.
 */
export class AsaasApiError extends PaymentProviderError {
  readonly errors: AsaasErrorItem[];
  constructor(message: string, status: number, errors: AsaasErrorItem[]) {
    super(message, status, errors.length ? errors : undefined);
    this.name = "AsaasApiError";
    this.errors = errors;
  }
  /** Códigos do Asaas (ex.: "invalid_action", "invalid_cpfCnpj"). */
  get codes(): string[] {
    return this.errors.map((e) => e.code).filter((c): c is string => !!c);
  }
}

/** Só os códigos e descrições do erro do Asaas (nada do corpo que enviamos). */
function errorItems(json: unknown): AsaasErrorItem[] {
  const errors = (json as { errors?: { code?: unknown; description?: unknown }[] } | undefined)
    ?.errors;
  return Array.isArray(errors)
    ? errors.map((e) => ({
        code: typeof e?.code === "string" ? e.code.slice(0, 64) : undefined,
        description: scrubProviderText(e?.description),
      }))
    : [];
}

export function createAsaasProvider(opts: AsaasOptions): PaymentProvider {
  return buildAsaasProvider(opts, null);
}

/** `account` nulo = conta principal; senão, a instância que age pela subconta. */
function buildAsaasProvider(
  opts: AsaasOptions,
  account: Omit<AccountCredentials, "apiKey"> | null,
): PaymentProvider {
  const base = (opts.apiUrl ?? ASAAS_URLS[opts.environment]).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  const apiKey = opts.apiKey;
  // O Asaas exige User-Agent em contas novas (nome da aplicação e ambiente).
  const userAgent = `plataforma-eventos/1.0 (Node.js; ${opts.environment})`;

  async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) {
    const headers: Record<string, string> = {
      access_token: apiKey,
      accept: "application/json",
      "user-agent": userAgent,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new PaymentProviderError("O Asaas não respondeu.", 0, String(err));
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      // Caminho sem o query string: ele pode levar o CPF (busca de cliente).
      throw new AsaasApiError(
        `O Asaas respondeu ${res.status} em ${method} ${path.split("?")[0]}.`,
        res.status,
        errorItems(json),
      );
    }
    return json as T;
  }

  async function findOrCreateCustomer(input: PixChargeInput): Promise<string> {
    const cpf = (input.payerCpf ?? "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      throw new PaymentProviderError("O Asaas exige o CPF de quem paga.", 422);
    }
    const found = await call<AsaasList<{ id: string }>>("GET", `/customers?cpfCnpj=${cpf}&limit=1`);
    if (found.data[0]?.id) return found.data[0].id;
    const created = await call<{ id: string }>("POST", "/customers", {
      name: input.payerName,
      cpfCnpj: cpf,
      email: input.payerEmail,
      // O comprovante é nosso: o Asaas não manda e-mails de cobrança ao convidado.
      notificationDisabled: true,
    });
    return created.id;
  }

  const getPayment = (id: string) =>
    call<AsaasPayment>("GET", `/payments/${encodeURIComponent(id)}`);

  async function listPayments(externalReference: string) {
    const list = await call<AsaasList<AsaasPayment>>(
      "GET",
      `/payments?externalReference=${encodeURIComponent(externalReference)}&limit=100`,
    );
    return list.data;
  }

  async function deletePayment(id: string) {
    await call("DELETE", `/payments/${encodeURIComponent(id)}`);
  }

  /** `split` do corpo (ausente sem taxa); nunca para a carteira da conta que cobra. */
  const splitOf = (rules: PixChargeInput["split"]) => {
    const split = splitRequestBody(rules, account?.walletId);
    return split ? { split } : {};
  };

  return {
    name: "asaas",
    publicKey: null,
    requiresCpf: true,

    async createPix(input) {
      const split = splitOf(input.split);
      const customer = await findOrCreateCustomer(input);
      const payment = await call<AsaasPayment>("POST", "/payments", {
        customer,
        billingType: "PIX",
        value: toAmount(input.amountCents),
        dueDate: dueDate(now()),
        description: input.description.slice(0, 500),
        externalReference: input.publicId,
        ...split,
      });
      let qr: { encodedImage?: string; payload?: string };
      try {
        qr = await call("GET", `/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
      } catch (err) {
        // Sem QR (ex.: conta sem chave Pix): não deixa uma cobrança órfã no Asaas.
        await deletePayment(payment.id).catch(() => undefined);
        throw err;
      }
      if (!qr.payload) {
        await deletePayment(payment.id).catch(() => undefined);
        throw new PaymentProviderError("O Asaas não devolveu o código Pix.", 502);
      }
      return snapshotFromPayment(payment, {
        code: qr.payload,
        qrImageBase64: qr.encodedImage ?? null,
        ticketUrl: payment.invoiceUrl ?? null,
      });
    },

    createCard() {
      return Promise.reject(
        new PaymentProviderError(
          "No Asaas o cartão é pago na fatura hospedada (createCardCheckout).",
          400,
        ),
      );
    },

    async createCardCheckout(input: CardCheckoutInput) {
      const split = splitOf(input.split);
      const value = toAmount(input.amountCents);
      // Reaproveita a fatura de cartão aberta com o mesmo valor (clique duplo, voltar da
      // fatura); apaga as de outro valor (a pessoa mudou "cobrir a taxa").
      let customer: string | undefined;
      for (const p of await listPayments(input.publicId)) {
        customer ??= p.customer;
        if (p.billingType !== "CREDIT_CARD" || p.deleted || mapAsaasStatus(p) !== "pending") {
          continue;
        }
        if (p.value === value && p.invoiceUrl) {
          return { ...snapshotFromPayment(p), checkoutUrl: p.invoiceUrl };
        }
        await deletePayment(p.id).catch(() => undefined);
      }
      if (!customer && input.baseChargeId) {
        customer = (await getPayment(input.baseChargeId)).customer;
      }
      if (!customer) {
        throw new PaymentProviderError("Pedido sem cliente no Asaas para cobrar no cartão.", 409);
      }
      const body: Record<string, unknown> = {
        customer,
        billingType: "CREDIT_CARD",
        value,
        dueDate: dueDate(now()),
        description: input.description.slice(0, 500),
        externalReference: input.publicId,
        ...split,
      };
      let payment: AsaasPayment;
      if (input.successUrl) {
        try {
          payment = await call<AsaasPayment>("POST", "/payments", {
            ...body,
            callback: { successUrl: input.successUrl, autoRedirect: true },
          });
        } catch (err) {
          // O Asaas só aceita successUrl do domínio cadastrado na conta: sem ele, a pessoa
          // volta pelo link da fatura e o webhook confirma do mesmo jeito.
          if (!(err instanceof PaymentProviderError && err.status === 400)) throw err;
          payment = await call<AsaasPayment>("POST", "/payments", body);
        }
      } else {
        payment = await call<AsaasPayment>("POST", "/payments", body);
      }
      if (!payment.invoiceUrl) {
        throw new PaymentProviderError("O Asaas não devolveu o link da fatura.", 502);
      }
      return { ...snapshotFromPayment(payment), checkoutUrl: payment.invoiceUrl };
    },

    async listCharges(externalReference) {
      return (await listPayments(externalReference)).map((p) => snapshotFromPayment(p));
    },

    async getCharge(id) {
      return snapshotFromPayment(await getPayment(id));
    },

    async refund(id) {
      // Corpo vazio = estorno integral.
      return snapshotFromPayment(
        await call<AsaasPayment>("POST", `/payments/${encodeURIComponent(id)}/refund`, {}),
      );
    },

    async cancel(id) {
      await deletePayment(id);
    },

    verifyWebhook(req: WebhookRequest) {
      // Na subconta o token fica vazio (a rota confere o token dela pelo hash gravado) e
      // `verifyWebhookToken` nunca aceita token vazio.
      return verifyWebhookToken(opts.webhookToken, req);
    },

    parseWebhook: parsePaymentEvent,

    parseAccountWebhook: parseAsaasAccountWebhook,

    async createSubaccount(input) {
      if (account) throw new PaymentProviderError("Só a conta principal cria subcontas.", 400);
      const json = await call<unknown>("POST", "/accounts", accountRequestBody(input));
      return parseAccountCreated(json, input);
    },

    forAccount(creds: AccountCredentials) {
      if (account) {
        throw new PaymentProviderError("Esta instância já age por uma subconta.", 400);
      }
      if (!creds.apiKey || !creds.walletId || !creds.providerAccountId) {
        throw new PaymentProviderError("Credenciais da subconta incompletas.", 500);
      }
      const keyEnv = asaasEnvFromKey(creds.apiKey);
      if (keyEnv && keyEnv !== opts.environment) {
        // Chave de sandbox com a API de produção (ou o contrário): o Asaas daria 401.
        throw new PaymentProviderError(
          `A chave da subconta não é do ambiente ${opts.environment} do Asaas.`,
          500,
        );
      }
      return buildAsaasProvider(
        { ...opts, apiKey: creds.apiKey, webhookToken: "" },
        { providerAccountId: creds.providerAccountId, walletId: creds.walletId },
      );
    },

    ...(account
      ? {
          async getAccountStatus() {
            const status = await call<AsaasAccountStatus>("GET", "/myAccount/status");
            const documents = await call<AsaasAccountDocuments>("GET", "/myAccount/documents");
            return accountStatusFromAsaas(status ?? {}, documents ?? {});
          },
        }
      : {}),
  };
}
