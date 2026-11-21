import { describe, expect, it } from "vitest";
import {
  AnonymizeInput,
  CUSTOM_CATEGORY_PATTERN,
  CustomCategoryKey,
  EVENT_ACTIONS,
  HOST_CONFIGURABLE_ACTIONS,
  HOST_NEVER_ACTIONS,
  limitMessage,
  ORG_ACTIONS,
  PLATFORM_ACTIONS,
  PlanInput,
  PlanLimits,
  PlanUpdate,
  PrivacySettings,
  SignupInput,
  VENDOR_CATEGORIES,
  withDependents,
} from "../src/index.ts";

describe("Fase 6: permissões", () => {
  it("ações novas de evento, organização e plataforma", () => {
    for (const a of ["privacy.read", "privacy.manage", "vendors.catalog"] as const) {
      expect(EVENT_ACTIONS).toContain(a);
    }
    for (const a of ["billing.manage", "domains.manage", "events.delete", "categories.manage"]) {
      expect(ORG_ACTIONS).toContain(a);
    }
    expect(PLATFORM_ACTIONS.every((a) => a.startsWith("platform."))).toBe(true);
  });

  it("anfitrião nunca cadastra no catálogo; privacidade é configurável", () => {
    expect(HOST_NEVER_ACTIONS).toContain("vendors.catalog");
    expect(HOST_CONFIGURABLE_ACTIONS).not.toContain("vendors.catalog");
    expect(HOST_CONFIGURABLE_ACTIONS).toContain("privacy.read");
    expect(withDependents(["privacy.read"])).toEqual(["privacy.read", "privacy.manage"]);
  });
});

describe("Fase 6: planos", () => {
  it("limites: null = sem limite; módulos válidos", () => {
    expect(PlanLimits.parse({})).toEqual({
      activeEvents: null,
      guestsPerEvent: null,
      members: null,
      storageMb: null,
      modules: null,
    });
    expect(PlanLimits.safeParse({ modules: ["gifts", "inexistente"] }).success).toBe(false);
  });

  it("PATCH sem padrões (não zera campos)", () => {
    expect(PlanUpdate.parse({ name: "Novo" })).toEqual({ name: "Novo" });
    expect(PlanInput.parse({ code: "basico", name: "Básico", limits: {} }).feeBps).toBe(50);
  });

  it("mensagem do limite", () => {
    expect(limitMessage("activeEvents", 1)).toContain("até 1");
  });
});

describe("Fase 6: cadastro e LGPD", () => {
  it("cadastro exige aceitar os termos", () => {
    const base = { name: "Ana", email: "ana@exemplo.com", organizationName: "Ana e Bruno" };
    expect(SignupInput.safeParse(base).success).toBe(false);
    expect(SignupInput.safeParse({ ...base, acceptTerms: true }).success).toBe(true);
  });

  it("privacidade: padrões e anonimização vazia recusada", () => {
    expect(PrivacySettings.parse({})).toMatchObject({ requireConsent: true, contactEmail: null });
    expect(AnonymizeInput.safeParse({}).success).toBe(false);
  });

  it("categoria própria nunca colide com as fixas", () => {
    expect(VENDOR_CATEGORIES.some((c) => CUSTOM_CATEGORY_PATTERN.test(c))).toBe(false);
    expect(CustomCategoryKey.safeParse("c-decoracao-floral").success).toBe(true);
    expect(CustomCategoryKey.safeParse("buffet").success).toBe(false);
  });
});
