import { describe, expect, it } from "vitest";
import {
  AcceptTeamInvite,
  CreateOrgEventInput,
  DEDICATED_SETTINGS_KEYS,
  EVENT_ACTION_LABELS,
  EVENT_ACTIONS,
  HOST_CONFIGURABLE_ACTIONS,
  HostPermissions,
  localDateTimeToIso,
  OrgInviteInput,
  parseSettings,
} from "../src/index.ts";

describe("localDateTimeToIso", () => {
  it("usa o offset do fuso naquela data", () => {
    expect(localDateTimeToIso("2027-04-10", "16:00", "America/Sao_Paulo")).toBe(
      "2027-04-10T16:00:00-03:00",
    );
    expect(localDateTimeToIso("2027-01-15", "09:30", "UTC")).toBe("2027-01-15T09:30:00+00:00");
    // Horário de verão: Lisboa +01:00 em julho, +00:00 em janeiro.
    expect(localDateTimeToIso("2027-07-01", "12:00", "Europe/Lisbon")).toBe(
      "2027-07-01T12:00:00+01:00",
    );
    expect(localDateTimeToIso("2027-01-01", "12:00", "Europe/Lisbon")).toBe(
      "2027-01-01T12:00:00+00:00",
    );
    expect(localDateTimeToIso("2027-04-10", "23:30", "Asia/Kolkata")).toBe(
      "2027-04-10T23:30:00+05:30",
    );
  });
});

describe("contratos da fase 3", () => {
  it("criar evento normaliza slug e domínio e aplica padrões", () => {
    const parsed = CreateOrgEventInput.parse({
      name: " Festa da Bia ",
      type: "fifteen",
      slug: "Festa-da-Bia",
      date: "2029-03-10",
      host: "",
    });
    expect(parsed).toMatchObject({
      name: "Festa da Bia",
      slug: "festa-da-bia",
      time: "16:00",
      timezone: "America/Sao_Paulo",
      status: "draft",
    });
    expect(CreateOrgEventInput.safeParse({ ...parsed, slug: "a b" }).success).toBe(false);
    expect(CreateOrgEventInput.safeParse({ ...parsed, type: "festa" }).success).toBe(false);
    expect(CreateOrgEventInput.safeParse({ ...parsed, timezone: "Lua/Base" }).success).toBe(false);
    expect(CreateOrgEventInput.safeParse({ ...parsed, host: "bia.com.br:8080" }).success).toBe(
      true,
    );
  });

  it("convite: e-mail minúsculo, papel padrão membro; senha com o mínimo do Better Auth", () => {
    expect(OrgInviteInput.parse({ email: " Ana@Exemplo.com " })).toEqual({
      email: "ana@exemplo.com",
      role: "member",
    });
    expect(OrgInviteInput.safeParse({ email: "x", role: "member" }).success).toBe(false);
    expect(AcceptTeamInvite.safeParse({ name: "Ana", password: "curta" }).success).toBe(false);
    expect(AcceptTeamInvite.safeParse({}).success).toBe(true);
  });

  it("permissões do anfitrião: só ações configuráveis, sem repetir, e rota própria", () => {
    expect(HOST_CONFIGURABLE_ACTIONS).not.toContain("dashboard.read");
    expect(HOST_CONFIGURABLE_ACTIONS.length).toBe(EVENT_ACTIONS.length - 1);
    for (const a of EVENT_ACTIONS) expect(EVENT_ACTION_LABELS[a]).toBeTruthy();
    expect(HostPermissions.parse({})).toEqual({ deny: [] });
    expect(
      HostPermissions.parse({ deny: ["orders.refund", "orders.refund", "gifts.write"] }),
    ).toEqual({ deny: ["orders.refund", "gifts.write"] });
    expect(HostPermissions.safeParse({ deny: ["dashboard.read"] }).success).toBe(false);
    expect(DEDICATED_SETTINGS_KEYS).toContain("event.host_permissions");
    expect(parseSettings({ "event.host_permissions": { deny: ["orders.refund"] } }).ok).toBe(true);
  });
});
