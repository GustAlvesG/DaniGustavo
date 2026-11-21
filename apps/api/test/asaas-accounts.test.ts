import { readFileSync } from "node:fs";
import { KycSnapshot } from "@casamento/shared";
import { describe, expect, it } from "vitest";
import {
  ASAAS_EXTRA_ACCOUNT_EVENTS,
  accountRequestBody,
  accountStatusFromSteps,
  asaasDateTimeToIso,
  mapDocumentStatus,
  mapKycStep,
  scrubProviderText,
  splitRequestBody,
} from "../src/payments/asaas-accounts.ts";
import { AsaasApiError, createAsaasProvider } from "../src/payments/asaas.ts";
import {
  HANDLED_ACCOUNT_EVENTS,
  HANDLED_PAYMENT_EVENTS,
  PaymentProviderError,
  type AccountCredentials,
  type PaymentProvider,
  type SubaccountInput,
  type WebhookRequest,
} from "../src/payments/provider.ts";

// Respostas gravadas em test/fixtures/asaas, montadas a partir da documentação do Asaas
// (API v3, docs.asaas.com). Nenhuma chamada sai para a rede: o `fetch` é sempre injetado.

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/asaas/${name}.json`, import.meta.url), "utf8"));

const MAIN_KEY = "$aact_hmlg_000000000000000000000000000000000000000000000000000000000000principal";
const SUB_KEY =
  "$aact_hmlg_000000000000000000000000000000000000000000000000000000000000subconta-teste";
const PLATFORM_WALLET = "7bafd95a-e783-4a62-9be1-23999af742c6";
const SUB_WALLET = "c0c1688f-636b-42c0-b6ee-7339182276b7";
const CPF = "52998224725";
const CNPJ = "11222333000181";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function mockFetch(responder: (call: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const fn = (input: string | URL | Request, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const { status = 200, body } = responder(call);
    return Promise.resolve(
      new Response(body === undefined ? "" : JSON.stringify(body), { status }),
    );
  };
  return { fetch: fn as typeof fetch, calls };
}

const main = (f: typeof fetch) =>
  createAsaasProvider({
    apiKey: MAIN_KEY,
    environment: "sandbox",
    webhookToken: "token-do-webhook-principal-com-32-caracteres",
    fetch: f,
    now: () => new Date("2026-11-21T15:00:00Z"),
  });

const CREDS: AccountCredentials = {
  providerAccountId: "4f468235-cec3-482f-b3d0-348af4c71940",
  walletId: SUB_WALLET,
  apiKey: SUB_KEY,
};

const sub = (f: typeof fetch): PaymentProvider => main(f).forAccount!(CREDS);

const webhook = {
  url: "https://api.exemplo.com/api/webhooks/payments/accounts/01JABCDEF0000000000000000",
  authToken: "a".repeat(64),
  email: "plataforma@exemplo.com",
};

const individual: SubaccountInput = {
  personType: "individual",
  name: "Ana Exemplo",
  document: CPF,
  email: "ana.exemplo@exemplo.com",
  mobilePhone: "11987654321",
  birthDate: "1990-05-20",
  incomeCents: 500_000,
  address: {
    postalCode: "01001000",
    street: "Rua das Flores",
    number: "100",
    district: "Centro",
  },
  webhook,
};

const company: SubaccountInput = {
  personType: "company",
  name: "Cerimonial Exemplo Ltda",
  document: CNPJ,
  email: "financeiro@exemplo.com",
  mobilePhone: "11987654321",
  phone: "1133334444",
  companyType: "LIMITED",
  incomeCents: 2_500_050,
  address: {
    postalCode: "01001000",
    street: "Avenida Paulista",
    number: "1000",
    complement: "Sala 12",
    district: "Bela Vista",
  },
  webhook,
};

const hookReq = (body: unknown): WebhookRequest => ({
  header: () => undefined,
  query: () => undefined,
  body,
});

/** Tudo o que pode vazar de um erro: mensagem, detalhes e a serialização. */
const errorText = (err: unknown) =>
  err instanceof Error
    ? `${err.message} ${JSON.stringify((err as PaymentProviderError).details)} ${JSON.stringify(err)}`
    : String(err);

describe("Asaas: cadastro da subconta", () => {
  it("PF: POST /accounts na conta principal com renda em reais, nascimento e o webhook da conta", async () => {
    const m = mockFetch(() => ({ body: fixture("accounts-create") }));
    const created = await main(m.fetch).createSubaccount!(individual);

    expect(m.calls).toHaveLength(1);
    const [call] = m.calls;
    expect(`${call!.method} ${call!.url}`).toBe("POST https://api-sandbox.asaas.com/v3/accounts");
    expect(call!.headers.access_token).toBe(MAIN_KEY);
    expect(call!.headers["content-type"]).toBe("application/json");
    const body = call!.body as Record<string, unknown>;
    expect(body).toEqual({
      name: "Ana Exemplo",
      email: "ana.exemplo@exemplo.com",
      cpfCnpj: CPF,
      birthDate: "1990-05-20",
      mobilePhone: "11987654321",
      incomeValue: 5000,
      address: "Rua das Flores",
      addressNumber: "100",
      province: "Centro",
      postalCode: "01001000",
      webhooks: [
        {
          name: expect.any(String),
          url: webhook.url,
          email: webhook.email,
          enabled: true,
          interrupted: false,
          apiVersion: 3,
          authToken: webhook.authToken,
          sendType: "SEQUENTIALLY",
          events: expect.any(Array),
        },
      ],
    });
    expect(body).not.toHaveProperty("companyType");
    const events = (body.webhooks as { events: string[] }[])[0]!.events;
    for (const e of [...HANDLED_PAYMENT_EVENTS, ...HANDLED_ACCOUNT_EVENTS]) {
      expect(events).toContain(e);
    }
    for (const e of ASAAS_EXTRA_ACCOUNT_EVENTS) expect(events).toContain(e);
    expect(new Set(events).size).toBe(events.length);

    expect(created).toMatchObject({
      providerAccountId: "4f468235-cec3-482f-b3d0-348af4c71940",
      walletId: SUB_WALLET,
      apiKey: SUB_KEY,
      personType: "individual",
      companyType: null,
      status: null,
    });
    // A chave só sai em `apiKey`; o `raw` não leva chave nem dado pessoal.
    const raw = JSON.stringify(created.raw);
    expect(raw).not.toContain(SUB_KEY);
    expect(raw).not.toContain(CPF);
    expect(raw).not.toContain("11987654321");
    expect(raw).not.toContain("Rua das Flores");
  });

  it("PJ: tipo de empresa, telefone e complemento; sem nascimento; chave no formato antigo", async () => {
    const m = mockFetch(() => ({ body: fixture("accounts-create-pj-legacy") }));
    const created = await main(m.fetch).createSubaccount!(company);
    const body = m.calls[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      cpfCnpj: CNPJ,
      companyType: "LIMITED",
      phone: "1133334444",
      complement: "Sala 12",
      incomeValue: 25000.5,
      province: "Bela Vista",
    });
    expect(body).not.toHaveProperty("birthDate");
    expect(created).toMatchObject({
      personType: "company",
      companyType: "LIMITED",
      walletId: "0c8b1f3e-2222-4d5a-8c11-000000000002",
    });
    expect(created.apiKey).toMatch(/subconta-pj$/);
    expect(JSON.stringify(created.raw)).not.toContain(created.apiKey);
    expect(JSON.stringify(created.raw)).not.toContain(CNPJ);
  });

  it("resposta sem chave vira erro (sem a chave a subconta não cobra)", async () => {
    const m = mockFetch(() => ({
      body: { ...(fixture("accounts-create") as object), accessToken: null },
    }));
    const err = await main(m.fetch).createSubaccount!(individual).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect((err as PaymentProviderError).status).toBe(502);
    expect((err as PaymentProviderError).details).toEqual({ missing: ["apiKey"] });
  });

  it("400 do Asaas → AsaasApiError com códigos, sem CPF, e-mail, celular, endereço ou chave", async () => {
    const m = mockFetch(() => ({ status: 400, body: fixture("error-account-cpf") }));
    const err = await main(m.fetch).createSubaccount!(individual).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AsaasApiError);
    expect(err).toBeInstanceOf(PaymentProviderError);
    const e = err as AsaasApiError;
    expect(e.status).toBe(400);
    expect(e.codes).toEqual(["invalid_cpfCnpj", "invalid_mobilePhone"]);
    expect(e.message).toBe("O Asaas respondeu 400 em POST /accounts.");
    const text = errorText(err);
    for (const secret of [
      CPF,
      "529.982.247-25",
      "ana.exemplo@exemplo.com",
      "98765-4321",
      "Rua das Flores",
      MAIN_KEY,
      webhook.authToken,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(e.errors[0]!.description).toContain("já está em uso");
  });

  it("só a conta principal cria subcontas", async () => {
    const m = mockFetch(() => ({ body: fixture("accounts-create") }));
    await expect(sub(m.fetch).createSubaccount!(individual)).rejects.toThrow(/conta principal/);
    expect(m.calls).toHaveLength(0);
  });
});

describe("Asaas: forAccount", () => {
  it("as chamadas levam a chave da subconta (nunca a principal) nas mesmas URLs", async () => {
    const m = mockFetch(({ url }) => {
      if (url.includes("/customers?")) return { body: { data: [{ id: "cus_sub" }] } };
      if (url.endsWith("/pixQrCode")) return { body: { payload: "000201pix", encodedImage: "" } };
      if (url.includes("/payments?externalReference")) return { body: { data: [] } };
      if (url.endsWith("/refund")) {
        return { body: { ...(fixture("payment-pix-split") as object), status: "REFUNDED" } };
      }
      return { body: fixture("payment-pix-split") };
    });
    const p = sub(m.fetch);
    expect(p.name).toBe("asaas");
    await p.createPix({
      publicId: "PUBSPLIT",
      amountCents: 20000,
      description: "Presente",
      payerEmail: "convidado@exemplo.com",
      payerName: "Convidado",
      payerCpf: CPF,
      expiresInMinutes: 30,
    });
    await p.getCharge("pay_080225913252");
    await p.listCharges!("PUBSPLIT");
    await p.refund("pay_080225913252");
    await p.cancel("pay_080225913252");

    expect(m.calls.length).toBeGreaterThanOrEqual(7);
    for (const c of m.calls) {
      expect(c.headers.access_token).toBe(SUB_KEY);
      expect(c.url.startsWith("https://api-sandbox.asaas.com/v3/")).toBe(true);
    }
    expect(JSON.stringify(m.calls)).not.toContain(MAIN_KEY);
    expect(m.calls.map((c) => `${c.method} ${c.url.split("?")[0]}`)).toContain(
      "DELETE https://api-sandbox.asaas.com/v3/payments/pay_080225913252",
    );
  });

  it("a instância principal continua com a chave principal depois de criar a da subconta", async () => {
    const m = mockFetch(() => ({ body: fixture("payment-pix-split") }));
    const p = main(m.fetch);
    p.forAccount!(CREDS);
    await p.getCharge("pay_1");
    expect(m.calls[0]!.headers.access_token).toBe(MAIN_KEY);
  });

  it("recusa credenciais incompletas, chave de outro ambiente e subconta de subconta", () => {
    const m = mockFetch(() => ({}));
    const p = main(m.fetch);
    expect(() => p.forAccount!({ ...CREDS, apiKey: "" })).toThrow(PaymentProviderError);
    expect(() => p.forAccount!({ ...CREDS, walletId: "" })).toThrow(PaymentProviderError);
    let err: unknown;
    try {
      p.forAccount!({ ...CREDS, apiKey: "$aact_prod_000000000000000000000000subconta" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect(errorText(err)).not.toContain("$aact_prod_");
    expect(() => sub(m.fetch).forAccount!(CREDS)).toThrow(/já age por uma subconta/);
  });

  it("o webhook da subconta é conferido pela rota (a instância recusa qualquer token)", () => {
    const p = sub(mockFetch(() => ({})).fetch);
    const req: WebhookRequest = {
      header: (n) => (n === "asaas-access-token" ? "" : undefined),
      query: () => undefined,
      body: {},
    };
    expect(p.verifyWebhook(req)).toBe(false);
  });

  it("4xx na subconta → AsaasApiError sem a chave", async () => {
    const m = mockFetch(() => ({
      status: 401,
      body: { errors: [{ code: "invalid_access_token" }] },
    }));
    const err = await sub(m.fetch)
      .getCharge("pay_1")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AsaasApiError);
    expect((err as AsaasApiError).codes).toEqual(["invalid_access_token"]);
    expect(errorText(err)).not.toContain(SUB_KEY);
  });
});

describe("Asaas: situação cadastral", () => {
  const statusFetch = (status: string, documents: string) =>
    mockFetch(({ url }) => {
      if (url.endsWith("/myAccount/status")) return { body: fixture(status) };
      if (url.endsWith("/myAccount/documents")) return { body: fixture(documents) };
      return { status: 404, body: { errors: [{ code: "not_found" }] } };
    });

  it("só existe na instância da subconta", () => {
    expect(main(mockFetch(() => ({})).fetch).getAccountStatus).toBeUndefined();
  });

  it("aprovada: consulta status e documentos com a chave da subconta", async () => {
    const m = statusFetch("account-status-approved", "account-documents-empty");
    const snap = await sub(m.fetch).getAccountStatus!();
    expect(m.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://api-sandbox.asaas.com/v3/myAccount/status",
      "GET https://api-sandbox.asaas.com/v3/myAccount/documents",
    ]);
    for (const c of m.calls) expect(c.headers.access_token).toBe(SUB_KEY);
    expect(snap.status).toBe("approved");
    expect(snap.kyc).toEqual({
      general: "approved",
      commercialInfo: "approved",
      bankAccountInfo: "approved",
      documentation: "approved",
      documents: [],
      rejectReason: null,
    });
    expect(KycSnapshot.parse(snap.kyc)).toEqual(snap.kyc);
  });

  it("pendente: documentos com link de envio e validade (horário de Brasília)", async () => {
    const m = statusFetch("account-status-pending", "account-documents-pending");
    const snap = await sub(m.fetch).getAccountStatus!();
    expect(snap.status).toBe("pending");
    expect(snap.kyc.documents).toEqual([
      {
        id: "172ed152-4fa4-43ad-9b69-39c323e9526c",
        type: "IDENTIFICATION",
        title: "Documentos de identificação",
        description: "Envie uma foto do documento com foto (frente e verso) e uma selfie.",
        status: "not_sent",
        onboardingUrl: "https://sandbox.asaas.com/onboarding/8ad196d6cbfcc5d05bfabcbb5c730f6a",
        onboardingUrlExpiresAt: "2026-11-28T03:00:00.000Z",
      },
      {
        id: "2a7c8e10-0000-4b1a-9c55-000000000002",
        type: "MINUTES_OF_CONSTITUTION",
        title: "Ata de eleição da última diretoria",
        description: null,
        status: "approved",
        onboardingUrl: null,
        onboardingUrlExpiresAt: null,
      },
    ]);
    expect(KycSnapshot.parse(snap.kyc)).toEqual(snap.kyc);
    // Nada do responsável (nome) nem dos documentos individuais entra na foto.
    expect(JSON.stringify(snap.kyc)).not.toContain("Ana Exemplo");
  });

  it("em análise", async () => {
    const m = statusFetch("account-status-awaiting", "account-documents-empty");
    const snap = await sub(m.fetch).getAccountStatus!();
    expect(snap.status).toBe("awaiting_approval");
    expect(snap.kyc.commercialInfo).toBe("awaiting_approval");
  });

  it("recusada: motivo e link só se for https", async () => {
    const m = statusFetch("account-status-rejected", "account-documents-rejected");
    const snap = await sub(m.fetch).getAccountStatus!();
    expect(snap.status).toBe("rejected");
    expect(snap.kyc.rejectReason).toBe("Documento ilegível. Envie uma nova foto.");
    expect(snap.kyc.documents[0]).toMatchObject({
      status: "rejected",
      onboardingUrl: null,
      // Só a data: vale até o fim do dia em Brasília.
      onboardingUrlExpiresAt: "2026-11-29T02:59:59.000Z",
    });
  });

  it("erro do Asaas na consulta vira AsaasApiError", async () => {
    const m = mockFetch(() => ({ status: 403, body: { errors: [{ code: "forbidden" }] } }));
    await expect(sub(m.fetch).getAccountStatus!()).rejects.toBeInstanceOf(AsaasApiError);
  });

  it("mapeamento de todas as combinações das etapas", () => {
    const steps = ["pending", "awaiting_approval", "approved", "rejected", null] as const;
    for (const general of ["pending", "awaiting_approval", "approved", "rejected"] as const) {
      for (const commercialInfo of steps) {
        for (const bankAccountInfo of steps) {
          for (const documentation of steps) {
            const kyc = { general, commercialInfo, bankAccountInfo, documentation };
            const others = [commercialInfo, bankAccountInfo, documentation];
            const expected =
              general === "approved"
                ? "approved"
                : general === "rejected" || others.includes("rejected")
                  ? "rejected"
                  : general === "awaiting_approval"
                    ? "awaiting_approval"
                    : "pending";
            expect(accountStatusFromSteps(kyc), JSON.stringify(kyc)).toBe(expected);
          }
        }
      }
    }
  });

  it("valores do Asaas → nosso vocabulário", () => {
    expect(mapKycStep("PENDING")).toBe("pending");
    expect(mapKycStep("AWAITING_APPROVAL")).toBe("awaiting_approval");
    expect(mapKycStep("APPROVED")).toBe("approved");
    expect(mapKycStep("REJECTED")).toBe("rejected");
    expect(mapKycStep("OUTRO")).toBeNull();
    expect(mapKycStep(undefined)).toBeNull();
    expect(mapDocumentStatus("NOT_SENT")).toBe("not_sent");
    expect(mapDocumentStatus("PENDING")).toBe("pending");
    expect(mapDocumentStatus("APPROVED")).toBe("approved");
    expect(mapDocumentStatus("REJECTED")).toBe("rejected");
    expect(mapDocumentStatus("IGNORED")).toBe("ignored");
    expect(mapDocumentStatus("NOVO")).toBe("not_sent");
    expect(asaasDateTimeToIso("2026-01-10 12:30")).toBe("2026-01-10T15:30:00.000Z");
    expect(asaasDateTimeToIso("amanhã")).toBeNull();
  });

  it("webhook de situação: os 16 eventos do contrato e os de vencimento dos dados comerciais", () => {
    const p = main(mockFetch(() => ({})).fetch);
    expect(p.parseAccountWebhook!(hookReq(fixture("webhook-account-status")))).toEqual({
      eventId: "evt_6561b631fa5580caac1d5d6a8a6d4ec9&1",
      type: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
    });
    for (const type of [...HANDLED_ACCOUNT_EVENTS, ...ASAAS_EXTRA_ACCOUNT_EVENTS]) {
      expect(p.parseAccountWebhook!(hookReq({ id: "evt_1", event: type }))?.type).toBe(type);
    }
    expect(p.parseAccountWebhook!(hookReq({ id: "evt_1", event: "PAYMENT_RECEIVED" }))).toBeNull();
    expect(
      p.parseAccountWebhook!(hookReq({ event: "ACCOUNT_STATUS_DOCUMENT_APPROVED" })),
    ).toBeNull();
    expect(p.parseAccountWebhook!(hookReq(null))).toBeNull();
  });
});

describe("Asaas: split", () => {
  const pixInput = {
    publicId: "PUBSPLIT",
    amountCents: 20000,
    description: "Presente: Jantar",
    payerEmail: "convidado@exemplo.com",
    payerName: "Convidado",
    payerCpf: CPF,
    expiresInMinutes: 30,
  };

  const pixFetch = () =>
    mockFetch(({ url, method }) => {
      if (url.includes("/customers?")) return { body: { data: [{ id: "cus_sub" }] } };
      if (url.endsWith("/pixQrCode")) return { body: { payload: "000201pix", encodedImage: "" } };
      if (method === "POST" && url.endsWith("/payments")) {
        return { body: fixture("payment-pix-split") };
      }
      return { status: 404, body: {} };
    });

  it("Pix da subconta com split percentual para a carteira da plataforma", async () => {
    const m = pixFetch();
    const charge = await sub(m.fetch).createPix({
      ...pixInput,
      split: [{ walletId: PLATFORM_WALLET, percent: 2.5 }],
    });
    const post = m.calls.find((c) => c.method === "POST")!;
    expect((post.body as Record<string, unknown>).split).toEqual([
      { walletId: PLATFORM_WALLET, percentualValue: 2.5 },
    ]);
    expect(charge.split).toEqual([
      {
        walletId: PLATFORM_WALLET,
        percent: 2.5,
        fixedCents: null,
        totalCents: 495,
        status: "pending",
      },
    ]);
  });

  it("sem taxa (vazio, ausente ou zero) não manda split", async () => {
    for (const split of [undefined, [], [{ walletId: PLATFORM_WALLET, percent: 0 }]]) {
      const m = pixFetch();
      await sub(m.fetch).createPix({ ...pixInput, split });
      const post = m.calls.find((c) => c.method === "POST")!;
      expect(post.body).not.toHaveProperty("split");
    }
  });

  it("fatura do cartão leva o mesmo split", async () => {
    const m = mockFetch(({ url, method }) => {
      if (url.includes("/payments?externalReference")) {
        return {
          body: {
            data: [
              {
                id: "pay_pix",
                customer: "cus_sub",
                billingType: "PIX",
                status: "PENDING",
                value: 200,
              },
            ],
          },
        };
      }
      if (method === "POST") {
        return {
          body: {
            ...(fixture("payment-pix-split") as object),
            id: "pay_card",
            billingType: "CREDIT_CARD",
            status: "PENDING",
          },
        };
      }
      return { status: 404, body: {} };
    });
    const charge = await sub(m.fetch).createCardCheckout!({
      publicId: "PUBSPLIT",
      amountCents: 20000,
      description: "Presente: Jantar",
      baseChargeId: "pay_pix",
      successUrl: null,
      split: [{ walletId: PLATFORM_WALLET, percent: 2.5 }],
    });
    const post = m.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({
      customer: "cus_sub",
      billingType: "CREDIT_CARD",
      split: [{ walletId: PLATFORM_WALLET, percentualValue: 2.5 }],
    });
    expect(post.headers.access_token).toBe(SUB_KEY);
    expect(charge.checkoutUrl).toMatch(/^https:/);
    expect(charge.split?.[0]?.walletId).toBe(PLATFORM_WALLET);
  });

  it("nunca para a carteira da própria subconta (nada é enviado)", async () => {
    const m = pixFetch();
    await expect(
      sub(m.fetch).createPix({ ...pixInput, split: [{ walletId: SUB_WALLET, percent: 2.5 }] }),
    ).rejects.toThrow(/carteira de quem cobra/);
    expect(m.calls).toHaveLength(0);
  });

  it("split desabilitado na conta (invalid_action) vira AsaasApiError com o código", async () => {
    const m = mockFetch(({ url, method }) => {
      if (url.includes("/customers?")) return { body: { data: [{ id: "cus_sub" }] } };
      if (method === "POST") return { status: 400, body: fixture("error-split-disabled") };
      return { status: 404, body: {} };
    });
    const err = await sub(m.fetch)
      .createPix({ ...pixInput, split: [{ walletId: PLATFORM_WALLET, percent: 2.5 }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AsaasApiError);
    expect((err as AsaasApiError).codes).toEqual(["invalid_action"]);
    expect(errorText(err)).not.toContain(CPF);
  });

  it("regras: percentual com 4 casas, fixo em reais, soma ≤ 100%", () => {
    expect(splitRequestBody([{ walletId: "w", percent: 2.123456 }])).toEqual([
      { walletId: "w", percentualValue: 2.1235 },
    ]);
    expect(splitRequestBody([{ walletId: "w", fixedCents: 150 }])).toEqual([
      { walletId: "w", fixedValue: 1.5 },
    ]);
    expect(() =>
      splitRequestBody([
        { walletId: "a", percent: 60 },
        { walletId: "b", percent: 50 },
      ]),
    ).toThrow(/100%/);
    expect(() => splitRequestBody([{ walletId: "", percent: 1 }])).toThrow(PaymentProviderError);
  });

  it("cobrança sem split devolve split null", async () => {
    const m = mockFetch(() => ({
      body: { ...(fixture("payment-pix-split") as object), split: undefined },
    }));
    expect((await sub(m.fetch).getCharge("pay_1")).split).toBeNull();
  });
});

describe("Asaas: textos de erro sem dado pessoal", () => {
  it("documentos, telefones e e-mails viram •••; texto comum fica", () => {
    expect(scrubProviderText("CPF 529.982.247-25 inválido")).toBe("CPF ••• inválido");
    expect(scrubProviderText("CNPJ 11222333000181")).toBe("CNPJ •••");
    expect(scrubProviderText("Celular (11) 98765-4321 inválido")).toBe("Celular ••• inválido");
    expect(scrubProviderText("E-mail ana@exemplo.com já usado")).toBe("E-mail ••• já usado");
    expect(scrubProviderText("Valor mínimo R$ 5,00 em 2026")).toBe("Valor mínimo R$ 5,00 em 2026");
    expect(scrubProviderText("Vence em 2026-11-21 ou 21/11/2026")).toBe(
      "Vence em 2026-11-21 ou 21/11/2026",
    );
    expect(scrubProviderText(undefined)).toBeUndefined();
  });

  it("corpo da subconta não guarda nada além do que vai ao Asaas", () => {
    const body = accountRequestBody(individual);
    expect(Object.keys(body).sort()).toEqual(
      [
        "address",
        "addressNumber",
        "birthDate",
        "cpfCnpj",
        "email",
        "incomeValue",
        "mobilePhone",
        "name",
        "postalCode",
        "province",
        "webhooks",
      ].sort(),
    );
  });
});
