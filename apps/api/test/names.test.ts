import { describe, expect, it } from "vitest";
import { nameMatches, normalizeName } from "../src/names.ts";

describe("normalizeName", () => {
  it("tira acentos, caixa e espaços extras", () => {
    expect(normalizeName("  ÉRICA   da  Conceição ")).toBe("erica da conceicao");
  });
});

describe("nameMatches", () => {
  it("casa início e fim do nome", () => {
    expect(nameMatches("Maria Clara Souza", "maria", "souza")).toBe(true);
    expect(nameMatches("Maria Clara Souza", "Maria Clara", "Souza")).toBe(true);
    expect(nameMatches("Maria Clara Souza", "clara", "souza")).toBe(false);
  });

  it("não deixa primeiro nome e sobrenome se sobreporem", () => {
    expect(nameMatches("Maria", "maria", "maria")).toBe(false);
  });
});
