import { describe, expect, it } from "vitest";
import { ApiError, ERROR_CODES, LookupRequest, RsvpRequest, SiteContent } from "../src/index.ts";

describe("RsvpRequest", () => {
  it("aceita resposta mínima e normaliza campos vazios", () => {
    const parsed = RsvpRequest.parse({
      guests: [{ id: 1, attending: true, dietaryNotes: "  " }],
      plusOneName: "",
      contact: { email: "", phone: "" },
    });
    expect(parsed.guests[0]?.dietaryNotes).toBeNull();
    expect(parsed.plusOneName).toBeNull();
    expect(parsed.contact).toEqual({ email: null, phone: null });
  });

  it("recusa e-mail inválido com mensagem em pt-BR", () => {
    const r = RsvpRequest.safeParse({
      guests: [{ id: 1, attending: false }],
      contact: { email: "sem-arroba" },
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("E-mail inválido");
  });

  it("exige a presença de cada convidado", () => {
    expect(RsvpRequest.safeParse({ guests: [{ id: 1 }] }).success).toBe(false);
  });
});

describe("LookupRequest e ApiError", () => {
  it("exige nome e sobrenome", () => {
    expect(LookupRequest.safeParse({ firstName: "Ana", lastName: " " }).success).toBe(false);
  });

  it("valida o formato de erro", () => {
    const body = { error: { code: ERROR_CODES.rsvpClosed, message: "Prazo encerrado." } };
    expect(ApiError.parse(body)).toEqual(body);
    expect(ApiError.safeParse({ error: "x" }).success).toBe(false);
  });
});

describe("SiteContent", () => {
  it("recusa conteúdo incompleto", () => {
    expect(SiteContent.safeParse({ couple: { names: "A", monogram: "A" } }).success).toBe(false);
  });
});
