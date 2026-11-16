import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "../src/env.ts";

const valid = {
  DATABASE_URL: "mysql://root:@127.0.0.1:3306/casamento",
  API_URL: "http://localhost:3333",
  WEB_KEY: "x".repeat(32),
  BETTER_AUTH_SECRET: "y".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3333",
};

describe("parseEnv", () => {
  it("aceita um ambiente válido e aplica padrões", () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3333);
    expect(env.NODE_ENV).toBe("development");
  });

  it("lista as variáveis ausentes em pt-BR", () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    try {
      parseEnv({ ...valid, WEB_KEY: "" });
    } catch (error) {
      expect((error as Error).message).toContain("WEB_KEY: não foi definida");
      expect((error as Error).message).toContain(".env");
    }
  });

  it("explica o formato esperado", () => {
    expect(() => parseEnv({ ...valid, WEB_KEY: "curta" })).toThrow(/pelo menos 32 caracteres/);
    expect(() => parseEnv({ ...valid, DATABASE_URL: "postgres://x" })).toThrow(
      /deve começar com mysql:\/\//,
    );
    expect(() => parseEnv({ ...valid, API_URL: "localhost" })).toThrow(/URL completa/);
  });
});
