import { describe, expect, it } from "vitest";
import {
  CheckinPin,
  effectiveHostDeny,
  HOST_CONFIGURABLE_ACTIONS,
  invitationTokenFromCode,
  renderWhatsappTemplate,
  SeatingTableUpdate,
  waLink,
  waPhone,
  withDependents,
} from "../src/index.ts";

describe("Fase 7: permissões", () => {
  it("as ações novas são ajustáveis pela organização", () => {
    for (const a of [
      "checkin.read",
      "checkin.manage",
      "seating.read",
      "seating.write",
      "vendors.portal",
      "whatsapp.send",
    ] as const) {
      expect(HOST_CONFIGURABLE_ACTIONS).toContain(a);
      expect(effectiveHostDeny([])).not.toContain(a);
    }
  });

  it("negar a leitura nega a escrita da área", () => {
    expect(withDependents(["checkin.read"])).toContain("checkin.manage");
    expect(withDependents(["seating.read"])).toContain("seating.write");
    expect(withDependents(["vendors.read"])).toContain("vendors.portal");
    expect(withDependents(["invitations.read"])).toContain("whatsapp.send");
  });
});

describe("Fase 7: check-in", () => {
  const token = "01JABCDEFGHJKMNPQRSTVWXYZ0";

  it("lê o token do convite da URL do QR ou do próprio token", () => {
    expect(invitationTokenFromCode(`https://exemplo.com/c/${token}`)).toBe(token);
    expect(invitationTokenFromCode(`https://exemplo.com/c/${token}?x=1`)).toBe(token);
    expect(invitationTokenFromCode(token.toLowerCase())).toBe(token);
    expect(invitationTokenFromCode("https://exemplo.com/presentes")).toBeNull();
    expect(invitationTokenFromCode("")).toBeNull();
  });

  it("PIN só com 6 números", () => {
    expect(CheckinPin.safeParse("123456").success).toBe(true);
    expect(CheckinPin.safeParse("12345").success).toBe(false);
    expect(CheckinPin.safeParse("12a456").success).toBe(false);
  });
});

describe("Fase 7: mesas", () => {
  it("PATCH sem campos não aplica padrão", () => {
    expect(SeatingTableUpdate.parse({})).toEqual({});
  });
});

describe("Fase 7: WhatsApp", () => {
  it("normaliza telefone brasileiro para o wa.me", () => {
    expect(waPhone("(11) 98765-4321")).toBe("5511987654321");
    expect(waPhone("+55 11 98765-4321")).toBe("5511987654321");
    expect(waPhone("011987654321")).toBe("5511987654321");
    expect(waPhone("(11) 3456-7890")).toBe("551134567890");
    expect(waPhone("123")).toBeNull();
    expect(waPhone(null)).toBeNull();
  });

  it("monta a mensagem e o link", () => {
    const msg = renderWhatsappTemplate("Olá, {convite}! {desconhecida}", { convite: "Ana" });
    expect(msg).toBe("Olá, Ana! {desconhecida}");
    expect(waLink("5511987654321", "Olá & até")).toBe(
      "https://wa.me/5511987654321?text=Ol%C3%A1%20%26%20at%C3%A9",
    );
  });
});
