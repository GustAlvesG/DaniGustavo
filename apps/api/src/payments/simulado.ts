import { decodeTime, ulid } from "ulid";
import type { KycSnapshot } from "@casamento/shared";
import {
  parseAccountEvent,
  parsePaymentEvent,
  PaymentProviderError,
  verifyWebhookToken,
  WEBHOOK_TOKEN_HEADER,
  type AccountCredentials,
  type AccountStatusSnapshot,
  type CardChargeInput,
  type ChargeSnapshot,
  type PaymentProvider,
  type PixChargeInput,
  type SplitRule,
  type SplitSnapshot,
  type SubaccountCreated,
  type SubaccountInput,
  type WebhookRequest,
} from "./provider.ts";

/*
 * Provedor de mentira para desenvolver sem conta no Asaas. Guarda as cobranças em memória
 * (somem ao reiniciar a API: o pedido continua pendente até expirar) e usa o mesmo formato
 * de webhook do Asaas (evento + token no header asaas-access-token), então o caminho do
 * código é o mesmo.
 *
 * Cartões de teste (o navegador manda só os 4 últimos dígitos no "token"):
 *   final 0002 → recusado; qualquer outro → aprovado.
 *
 * Fase 5 (docs/saas/fase-5.md §2): subcontas sem estado no servidor. A apiKey simulada carrega
 * o cenário da situação cadastral (`sim_<cenário>_<ULID>`), escolhido pelo e-mail do cadastro:
 * `+pendente` (documentos pendentes com link fictício), `+analise`, `+recusada`; qualquer outro
 * nasce aprovado. `forAccount` cobra pela subconta, com o split calculado como o Asaas
 * (percentual sobre o valor; aqui sem a taxa do provedor). As cobranças ficam num só lugar: a
 * instância da subconta só enxerga as dela (como no Asaas) e a conta principal enxerga todas,
 * para o "Simular pagamento aprovado" (`approve`) servir também aos pedidos de subconta.
 */

export const SIMULATED_CARDS = {
  approved: "4111 1111 1111 1111",
  rejected: "4000 0000 0000 0002",
} as const;

/** Carteira da plataforma no simulado (destino do split quando ASAAS_PLATFORM_WALLET_ID falta). */
export const SIMULATED_PLATFORM_WALLET = "sim-wallet-plataforma";

/** Link de envio de documentos fictício das subcontas `+pendente`. */
export const SIMULATED_ONBOARDING_URL = "about:blank#onboarding-simulado";

/** Cenários de situação cadastral, escolhidos pelo e-mail do cadastro (`fulano+analise@...`). */
export const SIMULATED_ACCOUNT_SCENARIOS = ["aprovada", "pendente", "analise", "recusada"] as const;
export type SimulatedAccountScenario = (typeof SIMULATED_ACCOUNT_SCENARIOS)[number];

// Sem `listCharges`: o simulado segue consultando só a cobrança ativa do pedido (como antes).
type ChargeOp = "createPix" | "createCard" | "getCharge" | "refund" | "cancel";

/** Uma operação feita no provedor simulado (para os testes conferirem a conta usada). */
export interface SimulatedOperation {
  op: ChargeOp;
  /** walletId da subconta que fez a chamada; null = conta principal. */
  account: string | null;
  /** Id da cobrança. */
  id: string;
}

export interface SimulatedProvider extends PaymentProvider {
  readonly name: "simulado";
  /** Marca a cobrança como paga (Pix) e devolve os headers/corpo de um webhook autenticado. */
  approve(providerOrderId: string): {
    path: string;
    headers: Record<string, string>;
    body: unknown;
  };
  /** walletId da subconta dona da cobrança (null = conta principal; undefined = não existe). */
  accountOf(providerOrderId: string): string | null | undefined;
  /**
   * Muda a situação cadastral de uma subconta pelo walletId (dev/testes: "aprovar" uma conta em
   * análise). `null` volta ao cenário do cadastro. Fica só na memória do processo.
   */
  setAccountStatus(walletId: string, status: AccountStatusSnapshot["status"] | null): void;
  /** Operações de cobrança feitas até agora (só memória; para os testes). */
  operations(): SimulatedOperation[];
}

/** Código copia e cola fictício, no formato do Pix, mas que nenhum banco aceita. */
function fakePixCode(publicId: string, amountCents: number): string {
  const amount = (amountCents / 100).toFixed(2);
  const ref = publicId.slice(-10);
  return (
    "00020126580014br.gov.bcb.pix0136SIMULACAO-NAO-PAGUE-ESTE-CODIGO" +
    `52040000530398654${String(amount.length).padStart(2, "0")}${amount}` +
    `5802BR5913DANI E GUSTAVO6013VOLTA REDONDA62140510${ref}6304SIMU`
  );
}

/** Cenário pelo e-mail do cadastro (o "+" do endereço). */
export function scenarioFromEmail(email: string): SimulatedAccountScenario {
  const local = email.toLowerCase().split("@")[0] ?? "";
  if (local.includes("+pendente")) return "pendente";
  if (local.includes("+analise")) return "analise";
  if (local.includes("+recusada")) return "recusada";
  return "aprovada";
}

function scenarioFromApiKey(apiKey: string): SimulatedAccountScenario | null {
  const match = /^sim_([a-z]+)_[0-9A-Z]{26}$/.exec(apiKey);
  const scenario = match?.[1] as SimulatedAccountScenario | undefined;
  return scenario && SIMULATED_ACCOUNT_SCENARIOS.includes(scenario) ? scenario : null;
}

const SCENARIO_STATUS: Record<SimulatedAccountScenario, AccountStatusSnapshot["status"]> = {
  aprovada: "approved",
  pendente: "pending",
  analise: "awaiting_approval",
  recusada: "rejected",
};

/** Situação cadastral simulada (o mesmo formato que o mapeamento do Asaas produz). */
export function simulatedAccountStatus(
  status: AccountStatusSnapshot["status"],
  createdAt: Date,
): AccountStatusSnapshot {
  const expires = new Date(createdAt.getTime() + 7 * 24 * 60 * 60_000).toISOString();
  const doc = (docStatus: KycSnapshot["documents"][number]["status"]) => ({
    id: "sim-doc-identificacao",
    type: "IDENTIFICATION",
    title: "Documento de identificação",
    description: "Foto do documento de quem responde pela conta (simulado).",
    status: docStatus,
    onboardingUrl: SIMULATED_ONBOARDING_URL,
    onboardingUrlExpiresAt: expires,
  });
  const kyc: Record<AccountStatusSnapshot["status"], KycSnapshot> = {
    approved: {
      general: "approved",
      commercialInfo: "approved",
      bankAccountInfo: "approved",
      documentation: "approved",
      documents: [],
      rejectReason: null,
    },
    pending: {
      general: "pending",
      commercialInfo: "approved",
      bankAccountInfo: "pending",
      documentation: "pending",
      documents: [doc("not_sent")],
      rejectReason: null,
    },
    awaiting_approval: {
      general: "awaiting_approval",
      commercialInfo: "approved",
      bankAccountInfo: "approved",
      documentation: "awaiting_approval",
      documents: [doc("pending")],
      rejectReason: null,
    },
    rejected: {
      general: "rejected",
      commercialInfo: "approved",
      bankAccountInfo: "approved",
      documentation: "rejected",
      documents: [doc("rejected")],
      rejectReason: "Documento ilegível (recusa simulada).",
    },
  };
  return { status, kyc: kyc[status], raw: { simulado: true, status } };
}

/** Repasses como o Asaas calcularia (percentual sobre o valor, arredondado para baixo). */
export function computeSimulatedSplit(
  amountCents: number,
  rules: SplitRule[] | undefined,
): SplitSnapshot[] | null {
  if (!rules?.length) return null;
  return rules.map((rule) => {
    const percent = rule.percent ?? null;
    const fixedCents = rule.fixedCents ?? null;
    // Percentual com até 4 casas, em inteiros (sem erro de ponto flutuante).
    const totalCents =
      percent !== null
        ? Math.floor((amountCents * Math.round(percent * 10_000)) / 1_000_000)
        : (fixedCents ?? 0);
    return { walletId: rule.walletId, percent, fixedCents, totalCents, status: "pending" };
  });
}

function setSplitStatus(charge: ChargeSnapshot, status: string) {
  for (const s of charge.split ?? []) s.status = status;
}

export function createSimulatedProvider(opts: { webhookSecret: string }): SimulatedProvider {
  /** Cobranças de todas as contas; `account` = walletId da subconta (null = principal). */
  const charges = new Map<string, { charge: ChargeSnapshot; account: string | null }>();
  /** Situação cadastral trocada por `setAccountStatus` (chave: walletId). */
  const statusOverride = new Map<string, AccountStatusSnapshot["status"]>();
  const log: SimulatedOperation[] = [];

  /** Cobrança visível para a conta (`wallet` undefined = principal, que vê todas). */
  const get = (id: string, wallet?: string) => {
    const stored = charges.get(id);
    if (!stored || (wallet !== undefined && stored.account !== wallet)) {
      throw new PaymentProviderError(
        `Cobrança simulada ${id} não existe (a API reiniciou?). O pedido expira sozinho.`,
        404,
      );
    }
    return stored.charge;
  };

  /** As operações de cobrança, iguais na conta principal e nas subcontas. */
  function chargeOps(wallet?: string) {
    const who = wallet ?? null;
    const record = (op: ChargeOp, id: string) => log.push({ op, account: who, id });

    // Como no Asaas: o split nunca vai para a carteira da própria conta que cobra.
    const checkSplit = (rules: SplitRule[] | undefined) => {
      if (wallet && rules?.some((r) => r.walletId === wallet)) {
        throw new PaymentProviderError("Split para a carteira da própria conta.", 400, {
          errors: [{ code: "invalid_split", description: "Carteira do split inválida." }],
        });
      }
    };

    const ops: Pick<PaymentProvider, ChargeOp> = {
      createPix(input: PixChargeInput) {
        return Promise.resolve().then(() => {
          checkSplit(input.split);
          const id = `SIM-PIX-${ulid()}`;
          record("createPix", id);
          const charge: ChargeSnapshot = {
            providerOrderId: id,
            externalReference: input.publicId,
            status: "pending",
            statusDetail: "waiting_transfer",
            method: "pix",
            paymentId: `SIM-PAY-${ulid()}`,
            amountCents: input.amountCents,
            pix: {
              code: fakePixCode(input.publicId, input.amountCents),
              qrImageBase64: null,
              ticketUrl: null,
            },
            split: computeSimulatedSplit(input.amountCents, input.split),
            raw: { simulado: true, expiresInMinutes: input.expiresInMinutes, account: who },
          };
          charges.set(id, { charge, account: who });
          return structuredClone(charge);
        });
      },

      // O split do cartão chega como campo extra (CardChargeInput não o declara: o Asaas não
      // usa o formulário de cartão, só a fatura hospedada).
      createCard(input: CardChargeInput & { split?: SplitRule[] }) {
        const match = /^sim_(\d{4})_/.exec(input.token);
        if (!match) {
          return Promise.reject(
            new PaymentProviderError("Token de cartão simulado inválido.", 400, {
              token: input.token,
            }),
          );
        }
        return Promise.resolve().then(() => {
          checkSplit(input.split);
          const rejected = match[1] === "0002";
          const id = `SIM-CARD-${ulid()}`;
          record("createCard", id);
          const charge: ChargeSnapshot = {
            providerOrderId: id,
            externalReference: input.publicId,
            status: rejected ? "rejected" : "approved",
            statusDetail: rejected ? "cc_rejected_insufficient_amount" : "accredited",
            method: "card",
            paymentId: `SIM-PAY-${ulid()}`,
            amountCents: input.amountCents,
            pix: null,
            split: computeSimulatedSplit(input.amountCents, input.split),
            raw: {
              simulado: true,
              installments: input.installments,
              last4: match[1],
              account: who,
            },
          };
          setSplitStatus(charge, rejected ? "cancelled" : "done");
          charges.set(id, { charge, account: who });
          return structuredClone(charge);
        });
      },

      getCharge(id) {
        return Promise.resolve().then(() => {
          record("getCharge", id);
          return structuredClone(get(id, wallet));
        });
      },

      refund(id) {
        return Promise.resolve().then(() => {
          record("refund", id);
          const charge = get(id, wallet);
          charge.status = "refunded";
          charge.statusDetail = "refunded";
          setSplitStatus(charge, "refunded");
          return structuredClone(charge);
        });
      },

      cancel(id) {
        return Promise.resolve().then(() => {
          record("cancel", id);
          const stored = charges.get(id);
          if (!stored || (wallet !== undefined && stored.account !== wallet)) return;
          const { charge } = stored;
          if (charge.status === "pending") {
            charge.status = "cancelled";
            charge.statusDetail = "canceled";
            charge.pix = null;
            setSplitStatus(charge, "cancelled");
          }
        });
      },
    };
    return ops;
  }

  /** O provedor agindo pela subconta (mesmo depósito de cobranças, só as dela à vista). */
  function forAccount(creds: AccountCredentials): PaymentProvider {
    const scenario = scenarioFromApiKey(creds.apiKey);
    if (!scenario) throw new PaymentProviderError("Chave de subconta simulada inválida.", 401);
    const createdAt = new Date(decodeTime(creds.apiKey.slice(-26)));
    return {
      name: "simulado",
      publicKey: null,
      ...chargeOps(creds.walletId),
      // O token do webhook da subconta é conferido pela rota (hash gravado na conta).
      verifyWebhook: () => false,
      parseWebhook: parsePaymentEvent,
      parseAccountWebhook: parseAccountEvent,
      getAccountStatus() {
        const status = statusOverride.get(creds.walletId) ?? SCENARIO_STATUS[scenario];
        return Promise.resolve(simulatedAccountStatus(status, createdAt));
      },
    };
  }

  return {
    name: "simulado",
    publicKey: null,
    // A conta principal vê as cobranças de todas as contas (ver o comentário do topo).
    ...chargeOps(),

    verifyWebhook(req: WebhookRequest) {
      return verifyWebhookToken(opts.webhookSecret, req);
    },

    parseWebhook: parsePaymentEvent,

    createSubaccount(input: SubaccountInput) {
      return Promise.resolve().then((): SubaccountCreated => {
        const scenario = scenarioFromEmail(input.email);
        const apiKey = `sim_${scenario}_${ulid()}`;
        return {
          providerAccountId: `sim-acc-${ulid()}`,
          walletId: `sim-wallet-${ulid()}`,
          apiKey,
          personType: input.personType,
          companyType: input.personType === "company" ? (input.companyType ?? null) : null,
          status: simulatedAccountStatus(
            SCENARIO_STATUS[scenario],
            new Date(decodeTime(apiKey.slice(-26))),
          ),
          // Sem documento, endereço, renda nem token: nada de dado pessoal ou segredo.
          raw: { simulado: true, scenario },
        };
      });
    },

    forAccount,
    parseAccountWebhook: parseAccountEvent,

    accountOf(id) {
      return charges.get(id)?.account;
    },

    setAccountStatus(walletId, status) {
      if (status === null) statusOverride.delete(walletId);
      else statusOverride.set(walletId, status);
    },

    operations() {
      return log.map((o) => ({ ...o }));
    },

    approve(id) {
      const charge = get(id);
      if (charge.status === "pending") {
        charge.status = "approved";
        charge.statusDetail = "accredited";
        charge.pix = null;
        setSplitStatus(charge, "done");
      }
      // Sempre pelo webhook global (o token da subconta só existe como hash no banco): a rota
      // global acha o pedido e, sendo de subconta, confere a cobrança pela própria subconta.
      return {
        path: "/api/webhooks/payments",
        headers: {
          "content-type": "application/json",
          [WEBHOOK_TOKEN_HEADER]: opts.webhookSecret,
        },
        body: {
          id: `evt_sim_${ulid()}`,
          event: charge.status === "approved" ? "PAYMENT_RECEIVED" : "PAYMENT_UPDATED",
          dateCreated: new Date().toISOString(),
          payment: {
            object: "payment",
            id,
            status: "RECEIVED",
            externalReference: charge.externalReference,
          },
        },
      };
    },
  };
}
