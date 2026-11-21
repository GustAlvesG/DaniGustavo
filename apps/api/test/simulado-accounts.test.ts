import { KycSnapshot } from "@casamento/shared";
import { describe, expect, it } from "vitest";
import {
  computeSimulatedSplit,
  createSimulatedProvider,
  PaymentProviderError,
  scenarioFromEmail,
  SIMULATED_ONBOARDING_URL,
  type SubaccountInput,
} from "../src/payments/index.ts";

/* Fase 5, frente B: subcontas, situação cadastral e split no provedor simulado. */

const input = (email: string): SubaccountInput => ({
  personType: "individual",
  name: "Fulana de Tal",
  document: "52998224725",
  email,
  mobilePhone: "24999998888",
  birthDate: "1990-01-01",
  incomeCents: 500000,
  address: { postalCode: "27200000", street: "Rua A", number: "1", district: "Centro" },
  webhook: { url: "http://localhost/api/webhooks/x", authToken: "segredo-do-webhook", email },
});

const pix = (publicId: string, split?: { walletId: string; percent: number }[]) => ({
  publicId,
  amountCents: 12345,
  description: "Presente",
  payerEmail: "a@exemplo.com",
  payerName: "A",
  expiresInMinutes: 30,
  ...(split ? { split } : {}),
});

describe("subcontas simuladas", () => {
  it("cenário pelo e-mail: aprovada por padrão, +pendente, +analise, +recusada", async () => {
    expect(scenarioFromEmail("ana@exemplo.com")).toBe("aprovada");
    const p = createSimulatedProvider({ webhookSecret: "s" });
    const expected = {
      "ana@exemplo.com": "approved",
      "ana+pendente@exemplo.com": "pending",
      "ana+analise@exemplo.com": "awaiting_approval",
      "ana+recusada@exemplo.com": "rejected",
    } as const;
    for (const [email, status] of Object.entries(expected)) {
      const created = await p.createSubaccount!(input(email));
      expect(created.status?.status).toBe(status);
      expect(KycSnapshot.parse(created.status!.kyc).general).toBe(status);
      const sub = p.forAccount!(created);
      expect((await sub.getAccountStatus!()).status).toBe(status);
    }
  });

  it("pendente traz o link de onboarding; nada de documento, token ou apiKey no raw", async () => {
    const p = createSimulatedProvider({ webhookSecret: "s" });
    const created = await p.createSubaccount!(input("ana+pendente@exemplo.com"));
    expect(created.status!.kyc.documents[0]).toMatchObject({
      status: "not_sent",
      onboardingUrl: SIMULATED_ONBOARDING_URL,
    });
    const raw = JSON.stringify([created.raw, created.status]);
    for (const secret of ["52998224725", "segredo-do-webhook", created.apiKey, "27200000"]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("setAccountStatus aprova uma conta em análise (dev) e volta ao cenário com null", async () => {
    const p = createSimulatedProvider({ webhookSecret: "s" });
    const created = await p.createSubaccount!(input("ana+analise@exemplo.com"));
    const sub = p.forAccount!(created);
    p.setAccountStatus(created.walletId, "approved");
    expect((await sub.getAccountStatus!()).status).toBe("approved");
    p.setAccountStatus(created.walletId, null);
    expect((await sub.getAccountStatus!()).status).toBe("awaiting_approval");
  });

  it("chave que não é de subconta simulada é recusada", () => {
    const p = createSimulatedProvider({ webhookSecret: "s" });
    expect(() => p.forAccount!({ providerAccountId: "x", walletId: "w", apiKey: "chave" })).toThrow(
      PaymentProviderError,
    );
  });
});

describe("cobranças por subconta", () => {
  it("split calculado sobre o valor e acompanhando a cobrança", async () => {
    expect(computeSimulatedSplit(12345, [{ walletId: "p", percent: 2.5 }])).toEqual([
      { walletId: "p", percent: 2.5, fixedCents: null, totalCents: 308, status: "pending" },
    ]);
    expect(computeSimulatedSplit(1000, [])).toBeNull();

    const p = createSimulatedProvider({ webhookSecret: "s" });
    const sub = p.forAccount!(await p.createSubaccount!(input("ana@exemplo.com")));
    const charge = await sub.createPix(pix("PED1", [{ walletId: "plataforma", percent: 2.5 }]));
    expect(charge.split?.[0]).toMatchObject({ totalCents: 308, status: "pending" });
    p.approve(charge.providerOrderId);
    expect((await sub.getCharge(charge.providerOrderId)).split?.[0]?.status).toBe("done");
    expect((await sub.refund(charge.providerOrderId)).split?.[0]?.status).toBe("refunded");
  });

  it("subconta só vê as próprias cobranças; a principal vê todas (simular pagamento)", async () => {
    const p = createSimulatedProvider({ webhookSecret: "s" });
    const a = await p.createSubaccount!(input("a@exemplo.com"));
    const b = await p.createSubaccount!(input("b@exemplo.com"));
    const subA = p.forAccount!(a);
    const subB = p.forAccount!(b);
    const charge = await subA.createPix(pix("PED2"));
    expect(p.accountOf(charge.providerOrderId)).toBe(a.walletId);
    await expect(subB.getCharge(charge.providerOrderId)).rejects.toMatchObject({ status: 404 });
    await expect(subB.refund(charge.providerOrderId)).rejects.toMatchObject({ status: 404 });
    await subB.cancel(charge.providerOrderId);
    expect((await subA.getCharge(charge.providerOrderId)).status).toBe("pending");
    expect((await p.getCharge(charge.providerOrderId)).externalReference).toBe("PED2");
    expect(p.approve(charge.providerOrderId).path).toBe("/api/webhooks/payments");
    expect((await subA.getCharge(charge.providerOrderId)).status).toBe("approved");
  });

  it("split para a carteira da própria subconta é recusado, como no Asaas", async () => {
    const p = createSimulatedProvider({ webhookSecret: "s" });
    const a = await p.createSubaccount!(input("a@exemplo.com"));
    await expect(
      p.forAccount!(a).createPix(pix("PED3", [{ walletId: a.walletId, percent: 1 }])),
    ).rejects.toMatchObject({ status: 400 });
  });
});
