import {
  COMPANY_TYPES,
  type CompanyType,
  type KycDocumentGroup,
  type KycDocumentStatus,
  type KycSnapshot,
  type KycStepStatus,
} from "@casamento/shared";
import {
  fromAmount,
  HANDLED_ACCOUNT_EVENTS,
  HANDLED_PAYMENT_EVENTS,
  PaymentProviderError,
  toAmount,
  type AccountStatusSnapshot,
  type AccountWebhookNotice,
  type SplitRule,
  type SplitSnapshot,
  type SubaccountCreated,
  type SubaccountInput,
  type WebhookRequest,
} from "./provider.ts";

/*
 * Fase 5 (docs/saas/fase-5.md, frente A): peças puras do Asaas para subcontas, situação
 * cadastral e split. O `asaas.ts` faz as chamadas; aqui só se monta o corpo e se lê a resposta,
 * para os testes conferirem cada mapeamento sem rede.
 *
 * Referências (docs.asaas.com): "Criar subconta" (POST /v3/accounts), "Verificar situação
 * cadastral da conta" (GET /v3/myAccount/status), "Verificar documentos pendentes"
 * (GET /v3/myAccount/documents), "Eventos para verificar situação da conta" e "Split de
 * pagamento".
 */

/* ------------------------------------------------------------------------ */
/* Cadastro da subconta                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Eventos de situação cadastral que a doc lista além dos 16 de `HANDLED_ACCOUNT_EVENTS`:
 * dados comerciais perto de vencer (40 dias antes) e vencidos (confirmação anual). Também
 * pedem uma nova consulta da situação.
 */
export const ASAAS_EXTRA_ACCOUNT_EVENTS = [
  "ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRED",
] as const;

const ACCOUNT_EVENTS = new Set<string>([...HANDLED_ACCOUNT_EVENTS, ...ASAAS_EXTRA_ACCOUNT_EVENTS]);

/** Eventos que o webhook da subconta assina: cobranças que mudam o pedido + situação cadastral. */
export function subaccountWebhookEvents(): string[] {
  return [...HANDLED_PAYMENT_EVENTS, ...ACCOUNT_EVENTS];
}

/** Nome do webhook no painel do Asaas (aparece para quem abre a subconta lá). */
export const SUBACCOUNT_WEBHOOK_NAME = "Presentes (plataforma)";

/**
 * Corpo de `POST /v3/accounts`. Renda/faturamento vai em reais; nascimento só na pessoa
 * física, tipo de empresa só na jurídica. O `loginEmail` fica de fora (o Asaas usa o `email`).
 * O objeto leva CPF/CNPJ e endereço: só vai ao `fetch`, nunca a log ou erro.
 */
export function accountRequestBody(input: SubaccountInput): Record<string, unknown> {
  const individual = input.personType === "individual";
  const body: Record<string, unknown> = {
    name: input.name,
    email: input.email,
    cpfCnpj: input.document.replace(/\D/g, ""),
    mobilePhone: input.mobilePhone,
    incomeValue: toAmount(input.incomeCents),
    address: input.address.street,
    addressNumber: input.address.number,
    province: input.address.district,
    postalCode: input.address.postalCode,
  };
  if (individual) body.birthDate = input.birthDate;
  else body.companyType = input.companyType;
  if (input.phone) body.phone = input.phone;
  if (input.address.complement) body.complement = input.address.complement;
  body.webhooks = [
    {
      name: SUBACCOUNT_WEBHOOK_NAME,
      url: input.webhook.url,
      email: input.webhook.email,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: input.webhook.authToken,
      sendType: "SEQUENTIALLY",
      events: subaccountWebhookEvents(),
    },
  ];
  return body;
}

/** Partes da resposta de `POST /v3/accounts` que usamos. */
export interface AsaasAccountCreated {
  object?: string;
  id?: unknown;
  walletId?: unknown;
  personType?: unknown;
  companyType?: unknown;
  /** Formato atual da doc: a chave vem em `accessToken.apiKey`. */
  accessToken?: { apiKey?: unknown } | null;
  /** Formato antigo (ainda citado no texto da doc): `apiKey` na raiz. */
  apiKey?: unknown;
  [key: string]: unknown;
}

/**
 * Lê a subconta criada. A `apiKey` só existe nesta resposta: vai para `SubaccountCreated.apiKey`
 * e é tirada do `raw` (junto do documento), que pode acabar num log de depuração.
 */
export function parseAccountCreated(
  json: unknown,
  input: Pick<SubaccountInput, "personType" | "companyType">,
): SubaccountCreated {
  const res = (json ?? {}) as AsaasAccountCreated;
  const apiKey =
    typeof res.accessToken?.apiKey === "string"
      ? res.accessToken.apiKey
      : typeof res.apiKey === "string"
        ? res.apiKey
        : "";
  const id = typeof res.id === "string" ? res.id : "";
  const walletId = typeof res.walletId === "string" ? res.walletId : "";
  if (!id || !walletId || !apiKey) {
    // A conta pode ter sido criada mesmo assim: sem a chave, só gerando outra no Asaas.
    throw new PaymentProviderError(
      "O Asaas criou a subconta sem devolver id, carteira ou chave de API.",
      502,
      { missing: [!id && "id", !walletId && "walletId", !apiKey && "apiKey"].filter(Boolean) },
    );
  }
  const personType =
    res.personType === "JURIDICA"
      ? "company"
      : res.personType === "FISICA"
        ? "individual"
        : input.personType;
  const fromAsaas = (COMPANY_TYPES as readonly unknown[]).includes(res.companyType)
    ? (res.companyType as CompanyType)
    : null;
  const companyType = personType === "company" ? (fromAsaas ?? input.companyType ?? null) : null;
  return {
    providerAccountId: id,
    walletId,
    apiKey,
    personType,
    companyType,
    status: null,
    raw: scrubAccountRaw(res),
  };
}

/** Cópia da resposta sem segredo nem dado pessoal (chave, documento, telefones, endereço). */
function scrubAccountRaw(res: AsaasAccountCreated): Record<string, unknown> {
  const keep = ["object", "id", "walletId", "personType", "companyType", "name", "email"];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in res) out[k] = res[k];
  return out;
}

/* ------------------------------------------------------------------------ */
/* Situação cadastral (KYC)                                                  */
/* ------------------------------------------------------------------------ */

/** GET /v3/myAccount/status */
export interface AsaasAccountStatus {
  id?: string;
  commercialInfo?: string | null;
  bankAccountInfo?: string | null;
  documentation?: string | null;
  general?: string | null;
}

/** Grupo de GET /v3/myAccount/documents */
export interface AsaasDocumentGroup {
  id?: unknown;
  status?: unknown;
  type?: unknown;
  title?: unknown;
  description?: unknown;
  onboardingUrl?: unknown;
  onboardingUrlExpirationDate?: unknown;
}

/** GET /v3/myAccount/documents */
export interface AsaasAccountDocuments {
  rejectReasons?: unknown;
  data?: AsaasDocumentGroup[] | null;
}

const STEP_STATUSES: Record<string, KycStepStatus> = {
  PENDING: "pending",
  AWAITING_APPROVAL: "awaiting_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
};

/** Etapa do Asaas → nossa; desconhecida/ausente = null. */
export function mapKycStep(value: unknown): KycStepStatus | null {
  return typeof value === "string" ? (STEP_STATUSES[value] ?? null) : null;
}

const DOCUMENT_STATUSES: Record<string, KycDocumentStatus> = {
  NOT_SENT: "not_sent",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  IGNORED: "ignored",
};

/** Situação do grupo de documentos; desconhecida conta como "não enviado" (pede ação). */
export function mapDocumentStatus(value: unknown): KycDocumentStatus {
  return typeof value === "string" ? (DOCUMENT_STATUSES[value] ?? "not_sent") : "not_sent";
}

/**
 * Situação geral (§2 do plano): `general` aprovado → aprovada; qualquer etapa recusada →
 * recusada; `general` em análise → em análise; senão, pendente.
 */
export function accountStatusFromSteps(
  kyc: Pick<KycSnapshot, "general" | "commercialInfo" | "bankAccountInfo" | "documentation">,
): AccountStatusSnapshot["status"] {
  if (kyc.general === "approved") return "approved";
  const steps = [kyc.general, kyc.commercialInfo, kyc.bankAccountInfo, kyc.documentation];
  if (steps.includes("rejected")) return "rejected";
  if (kyc.general === "awaiting_approval") return "awaiting_approval";
  return "pending";
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Só links https do provedor vão ao painel (o link abre direto no navegador de quem cadastra). */
function httpsUrl(v: unknown): string | null {
  const s = str(v, 2048);
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

/** "2025-03-04 00:00:00" (horário de Brasília, como o Asaas manda) → ISO com o fuso. */
export function asaasDateTimeToIso(v: unknown): string | null {
  const s = str(v, 32);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/.exec(s);
  if (!m) return null;
  const time = m[2] ? (m[2].length === 5 ? `${m[2]}:00` : m[2]) : "23:59:59";
  const date = new Date(`${m[1]}T${time}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rejectReasonOf(v: unknown): string | null {
  if (typeof v === "string") return str(v, 500);
  if (Array.isArray(v)) {
    const parts = v
      .map((r) =>
        typeof r === "string"
          ? r
          : typeof (r as { description?: unknown })?.description === "string"
            ? (r as { description: string }).description
            : "",
      )
      .filter((s) => s.trim());
    return parts.length ? parts.join("; ").slice(0, 500) : null;
  }
  return null;
}

export function documentGroupFromAsaas(group: AsaasDocumentGroup): KycDocumentGroup | null {
  const id = str(group.id, 191);
  if (!id) return null;
  const description = str(group.description, 500);
  return {
    id,
    type: str(group.type, 64) ?? "OTHER",
    title: str(group.title, 191) ?? "Documento",
    // O Asaas manda "Não possui descrição" quando não há: melhor mostrar nada.
    description: description && description !== "Não possui descrição" ? description : null,
    status: mapDocumentStatus(group.status),
    onboardingUrl: httpsUrl(group.onboardingUrl),
    onboardingUrlExpiresAt: asaasDateTimeToIso(group.onboardingUrlExpirationDate),
  };
}

/** Junta as duas respostas na foto gravada em `payment_accounts.kyc`. */
export function accountStatusFromAsaas(
  status: AsaasAccountStatus,
  documents: AsaasAccountDocuments,
): AccountStatusSnapshot {
  const kyc: KycSnapshot = {
    general: mapKycStep(status.general) ?? "pending",
    commercialInfo: mapKycStep(status.commercialInfo),
    bankAccountInfo: mapKycStep(status.bankAccountInfo),
    documentation: mapKycStep(status.documentation),
    documents: (Array.isArray(documents.data) ? documents.data : [])
      .map(documentGroupFromAsaas)
      .filter((d): d is KycDocumentGroup => d !== null),
    rejectReason: rejectReasonOf(documents.rejectReasons),
  };
  return { status: accountStatusFromSteps(kyc), kyc, raw: { status, documents } };
}

/** Aviso de situação cadastral no webhook da subconta (os 16 do contrato + os de vencimento). */
export function parseAsaasAccountWebhook(req: WebhookRequest): AccountWebhookNotice | null {
  if (typeof req.body !== "object" || req.body === null) return null;
  const body = req.body as { id?: unknown; event?: unknown };
  const eventId = typeof body.id === "string" ? body.id : "";
  const type = typeof body.event === "string" ? body.event : "";
  if (!eventId || !ACCOUNT_EVENTS.has(type)) return null;
  return { eventId: eventId.slice(0, 128), type };
}

/* ------------------------------------------------------------------------ */
/* Split                                                                     */
/* ------------------------------------------------------------------------ */

/** Repasse como o Asaas devolve em `payment.split[]`. */
export interface AsaasSplit {
  id?: string;
  walletId?: string;
  fixedValue?: number | null;
  percentualValue?: number | null;
  totalValue?: number | null;
  status?: string | null;
  cancellationReason?: string | null;
}

/**
 * `split` do corpo de `POST /payments`. Sem regra (taxa 0), sem `split` no corpo. Percentual
 * com até 4 casas e fixo em reais com 2 (limites do Asaas); a carteira de quem cobra nunca
 * entra (o Asaas recusa e seria dinheiro indo para si mesmo).
 */
export function splitRequestBody(
  rules: SplitRule[] | undefined,
  ownWalletId?: string | null,
): Record<string, unknown>[] | undefined {
  const active = (rules ?? []).filter((r) => (r.percent ?? 0) > 0 || (r.fixedCents ?? 0) > 0);
  if (active.length === 0) return undefined;
  let percentTotal = 0;
  const out = active.map((r) => {
    if (!r.walletId) throw new PaymentProviderError("Split sem carteira de destino.", 422);
    if (ownWalletId && r.walletId === ownWalletId) {
      throw new PaymentProviderError("O split não pode ir para a carteira de quem cobra.", 422);
    }
    const item: Record<string, unknown> = { walletId: r.walletId };
    if ((r.percent ?? 0) > 0) {
      const percent = Math.round(r.percent! * 10_000) / 10_000;
      percentTotal += percent;
      item.percentualValue = percent;
    }
    if ((r.fixedCents ?? 0) > 0) item.fixedValue = toAmount(Math.round(r.fixedCents!));
    return item;
  });
  if (percentTotal > 100) {
    throw new PaymentProviderError("A soma dos percentuais do split passa de 100%.", 422);
  }
  return out;
}

/** `payment.split[]` → `ChargeSnapshot.split` (null quando a cobrança não tem split). */
export function splitFromPayment(split: unknown): SplitSnapshot[] | null {
  if (!Array.isArray(split) || split.length === 0) return null;
  return (split as AsaasSplit[])
    .filter((s) => typeof s?.walletId === "string")
    .map((s) => ({
      walletId: s.walletId!,
      percent: typeof s.percentualValue === "number" ? s.percentualValue : null,
      fixedCents: typeof s.fixedValue === "number" ? fromAmount(s.fixedValue) : null,
      totalCents: typeof s.totalValue === "number" ? fromAmount(s.totalValue) : null,
      status: typeof s.status === "string" ? s.status.toLowerCase().slice(0, 32) : null,
    }));
}

/* ------------------------------------------------------------------------ */
/* Erros                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Descrição do erro do Asaas sem dado pessoal: a mensagem às vezes repete o que mandamos
 * ("O CPF/CNPJ 123.456.789-09 já está em uso", e-mail, celular). Sequências de 8+ dígitos
 * (CPF, CNPJ, CEP, telefone) e e-mails viram "•••".
 */
export function scrubProviderText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "•••")
    .replace(/\(?\d[\d.\-/() ]{6,}\d/g, (m) =>
      m.replace(/\D/g, "").length < 8 || /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})$/.test(m)
        ? m // datas ficam
        : "•••",
    )
    .slice(0, 500);
}
