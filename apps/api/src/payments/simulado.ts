import { ulid } from "ulid";
import {
  parsePaymentEvent,
  PaymentProviderError,
  verifyWebhookToken,
  WEBHOOK_TOKEN_HEADER,
  type CardChargeInput,
  type ChargeSnapshot,
  type PaymentProvider,
  type PixChargeInput,
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
 */

export const SIMULATED_CARDS = {
  approved: "4111 1111 1111 1111",
  rejected: "4000 0000 0000 0002",
} as const;

export interface SimulatedProvider extends PaymentProvider {
  readonly name: "simulado";
  /** Marca a cobrança como paga (Pix) e devolve os headers/corpo de um webhook autenticado. */
  approve(providerOrderId: string): {
    path: string;
    headers: Record<string, string>;
    body: unknown;
  };
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

export function createSimulatedProvider(opts: { webhookSecret: string }): SimulatedProvider {
  const charges = new Map<string, ChargeSnapshot>();

  const get = (id: string) => {
    const charge = charges.get(id);
    if (!charge) {
      throw new PaymentProviderError(
        `Cobrança simulada ${id} não existe (a API reiniciou?). O pedido expira sozinho.`,
        404,
      );
    }
    return charge;
  };

  return {
    name: "simulado",
    publicKey: null,

    createPix(input: PixChargeInput) {
      const id = `SIM-PIX-${ulid()}`;
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
        raw: { simulado: true, expiresInMinutes: input.expiresInMinutes },
      };
      charges.set(id, charge);
      return Promise.resolve(structuredClone(charge));
    },

    createCard(input: CardChargeInput) {
      const match = /^sim_(\d{4})_/.exec(input.token);
      if (!match) {
        return Promise.reject(
          new PaymentProviderError("Token de cartão simulado inválido.", 400, {
            token: input.token,
          }),
        );
      }
      const rejected = match[1] === "0002";
      const id = `SIM-CARD-${ulid()}`;
      const charge: ChargeSnapshot = {
        providerOrderId: id,
        externalReference: input.publicId,
        status: rejected ? "rejected" : "approved",
        statusDetail: rejected ? "cc_rejected_insufficient_amount" : "accredited",
        method: "card",
        paymentId: `SIM-PAY-${ulid()}`,
        amountCents: input.amountCents,
        pix: null,
        raw: { simulado: true, installments: input.installments, last4: match[1] },
      };
      charges.set(id, charge);
      return Promise.resolve(structuredClone(charge));
    },

    getCharge(id) {
      return Promise.resolve().then(() => structuredClone(get(id)));
    },

    refund(id) {
      return Promise.resolve().then(() => {
        const charge = get(id);
        charge.status = "refunded";
        charge.statusDetail = "refunded";
        return structuredClone(charge);
      });
    },

    cancel(id) {
      const charge = charges.get(id);
      if (charge && charge.status === "pending") {
        charge.status = "cancelled";
        charge.statusDetail = "canceled";
        charge.pix = null;
      }
      return Promise.resolve();
    },

    verifyWebhook(req: WebhookRequest) {
      return verifyWebhookToken(opts.webhookSecret, req);
    },

    parseWebhook: parsePaymentEvent,

    approve(id) {
      const charge = get(id);
      if (charge.status === "pending") {
        charge.status = "approved";
        charge.statusDetail = "accredited";
        charge.pix = null;
      }
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
