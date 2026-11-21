import { describe, expect, it } from "vitest";
import { fieldOf, signupFailureMessage } from "./signup-state";

const failure = (status: number, code: string, message = "Mensagem da API.") => ({
  ok: false as const,
  status,
  error: { code, message },
});

describe("estado do cadastro", () => {
  it("marca o campo certo", () => {
    expect(fieldOf(["email"])).toBe("email");
    expect(fieldOf(["acceptTerms"])).toBe("acceptTerms");
    expect(fieldOf(["website"])).toBeUndefined();
    expect(fieldOf([])).toBeUndefined();
  });

  it("traduz as falhas da API", () => {
    expect(signupFailureMessage(failure(404, "not_found"))).toMatch(/ainda não está aberto/);
    expect(signupFailureMessage(failure(429, "too_many_requests", "Aguarde 10 minuto(s)."))).toBe(
      "Aguarde 10 minuto(s).",
    );
    expect(signupFailureMessage(failure(422, "invalid_request", "E-mail inválido."))).toBe(
      "E-mail inválido.",
    );
    expect(signupFailureMessage(failure(0, "unavailable"))).toMatch(/Tente de novo/);
    expect(signupFailureMessage(failure(502, "internal_error"))).toMatch(/Tente de novo/);
  });
});
