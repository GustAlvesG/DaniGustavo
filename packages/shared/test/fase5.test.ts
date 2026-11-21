import { describe, expect, it } from "vitest";
import {
  effectiveHostDeny,
  estimatePlatformFeeCents,
  EventReceiverUpdate,
  feePercentToBps,
  HOST_CONFIGURABLE_ACTIONS,
  HostPermissions,
  isValidCnpj,
  KycSnapshot,
  maskDocument,
  PaymentAccountInput,
} from "../src/index.ts";

// Fase 5 (docs/saas/fase-5.md): contratos de recebimentos.

const address = {
  postalCode: "27.260-000",
  street: "Rua das Flores",
  number: "10",
  district: "Centro",
};
const person = {
  personType: "individual",
  name: "Fulana de Tal",
  document: "529.982.247-25",
  email: "Fulana@Exemplo.com",
  mobilePhone: "(24) 99999-0000",
  birthDate: "1990-05-20",
  incomeCents: 500_000,
  address,
};

describe("documentos", () => {
  it("CNPJ pelos dígitos verificadores", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
  });

  it("mascara deixando só os últimos dígitos", () => {
    expect(maskDocument("529.982.247-25")).toBe("•••.•••.247-25");
    expect(maskDocument("11222333000181")).toBe("••.•••.•••/0001-81");
    expect(maskDocument("1")).toBe("•••");
  });
});

describe("PaymentAccountInput", () => {
  it("pessoa física: normaliza dígitos e e-mail", () => {
    const v = PaymentAccountInput.parse(person);
    expect(v.document).toBe("52998224725");
    expect(v.mobilePhone).toBe("24999990000");
    expect(v.address.postalCode).toBe("27260000");
    expect(v.email).toBe("fulana@exemplo.com");
  });

  it("pessoa física exige CPF válido e nascimento", () => {
    const bad = PaymentAccountInput.safeParse({ ...person, document: "11122233344" });
    expect(bad.success).toBe(false);
    const noBirth = PaymentAccountInput.safeParse({ ...person, birthDate: undefined });
    expect(noBirth.error?.issues.map((i) => i.path.join("."))).toContain("birthDate");
  });

  it("pessoa jurídica exige CNPJ e tipo de empresa", () => {
    const company = { ...person, personType: "company", document: "11.222.333/0001-81" };
    expect(PaymentAccountInput.safeParse(company).error?.issues[0]?.path).toEqual(["companyType"]);
    expect(PaymentAccountInput.safeParse({ ...company, companyType: "MEI" }).success).toBe(true);
    expect(
      PaymentAccountInput.safeParse({ ...company, companyType: "MEI", document: "52998224725" })
        .success,
    ).toBe(false);
  });
});

describe("recebedor e taxa", () => {
  it("anfitrião exige a conta escolhida", () => {
    expect(EventReceiverUpdate.safeParse({ receiver: "host" }).success).toBe(false);
    expect(EventReceiverUpdate.safeParse({ receiver: "host", accountId: 3 }).success).toBe(true);
    expect(EventReceiverUpdate.safeParse({ receiver: "organization" }).success).toBe(true);
  });

  it("percentual em centésimos e estimativa em centavos", () => {
    expect(feePercentToBps(2.5)).toBe(250);
    expect(feePercentToBps(0.1 + 0.2)).toBe(30);
    expect(estimatePlatformFeeCents(10_000, 250)).toBe(250);
    expect(estimatePlatformFeeCents(999, 250)).toBe(24);
    expect(estimatePlatformFeeCents(10_000, 0)).toBe(0);
  });

  it("KycSnapshot com padrões", () => {
    expect(
      KycSnapshot.parse({
        general: "pending",
        commercialInfo: null,
        bankAccountInfo: null,
        documentation: null,
      }),
    ).toEqual({
      general: "pending",
      commercialInfo: null,
      bankAccountInfo: null,
      documentation: null,
      documents: [],
      rejectReason: null,
    });
  });
});

describe("permissões da fase 5", () => {
  it("anfitrião: configurar recebedor nunca; conta própria só liberada", () => {
    expect(HOST_CONFIGURABLE_ACTIONS).not.toContain("payments.configure");
    expect(HOST_CONFIGURABLE_ACTIONS).not.toContain("payments.own_account");
    expect(HOST_CONFIGURABLE_ACTIONS).toContain("payments.read");
    // Fase 6: `vendors.catalog` também é do tipo "nunca o anfitrião".
    expect(effectiveHostDeny([])).toEqual([
      "payments.own_account",
      "payments.configure",
      "vendors.catalog",
    ]);
    expect(effectiveHostDeny([], ["payments.own_account"])).toEqual([
      "payments.configure",
      "vendors.catalog",
    ]);
    expect(HostPermissions.safeParse({ allow: ["payments.configure"] }).success).toBe(false);
    expect(HostPermissions.safeParse({ deny: ["payments.own_account"] }).success).toBe(false);
  });
});
