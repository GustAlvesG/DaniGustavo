import { describe, expect, it } from "vitest";
import { formatBRL } from "./format";

describe("formatBRL", () => {
  it("formata centavos em reais", () => {
    expect(formatBRL(12345).replace(/\s/g, " ")).toBe("R$ 123,45");
  });

  it("formata zero", () => {
    expect(formatBRL(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });
});
