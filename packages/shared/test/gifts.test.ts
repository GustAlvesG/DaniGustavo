import { describe, expect, it } from "vitest";
import { cardFeeCents, CreateOrderRequest } from "../src/gifts.ts";

describe("cardFeeCents", () => {
  it("calcula a taxa em centavos, arredondando para cima", () => {
    expect(cardFeeCents(10000, 4.98)).toBe(498);
    expect(cardFeeCents(45000, 4.98)).toBe(2241);
    expect(cardFeeCents(1001, 4.98)).toBe(50);
    expect(cardFeeCents(10000, 0)).toBe(0);
  });
});

describe("CreateOrderRequest", () => {
  it("aplica padrões e trata recado vazio como ausente", () => {
    const parsed = CreateOrderRequest.parse({
      giftSlug: "cafeteira",
      buyerName: " Ana ",
      buyerEmail: "ana@exemplo.com",
      message: "  ",
    });
    expect(parsed).toMatchObject({
      quantity: 1,
      method: "pix",
      showOnWall: false,
      buyerName: "Ana",
    });
    expect(parsed.message).toBeUndefined();
  });

  it("explica o erro em pt-BR", () => {
    const r = CreateOrderRequest.safeParse({ giftSlug: "x", buyerName: "A", buyerEmail: "x" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Informe seu nome.");
  });
});
