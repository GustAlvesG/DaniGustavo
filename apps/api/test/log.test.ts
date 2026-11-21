import { describe, expect, it } from "vitest";
import {
  clientIp,
  createLogger,
  describeError,
  hashIp,
  logPath,
  loggerFromEnv,
  scrubFields,
  scrubText,
} from "../src/log.ts";

// Fase 6, frente D: logs estruturados sem dado pessoal nem segredo.

const capture = (format: "json" | "texto", level?: "debug" | "info" | "warn" | "error") => {
  const lines: { line: string; level: string }[] = [];
  const logger = createLogger({
    format,
    level,
    write: (line, lvl) => lines.push({ line, level: lvl }),
    now: () => new Date("2026-11-21T12:00:00Z"),
  });
  return { logger, lines };
};

describe("logger", () => {
  it("JSON: uma linha por evento, com hora, nível e mensagem", () => {
    const { logger, lines } = capture("json");
    logger.info("request", { method: "GET", status: 200 });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!.line)).toEqual({
      time: "2026-11-21T12:00:00.000Z",
      level: "info",
      msg: "request",
      method: "GET",
      status: 200,
    });
  });

  it("respeita o nível mínimo", () => {
    const { logger, lines } = capture("json", "warn");
    logger.info("não sai");
    logger.debug("não sai");
    logger.warn("sai");
    expect(lines.map((l) => (JSON.parse(l.line) as { msg: string }).msg)).toEqual(["sai"]);
  });

  it("texto: legível, com os campos no fim", () => {
    const { logger, lines } = capture("texto");
    logger.error("[expiração] falha", { job: "expiração" });
    expect(lines[0]).toEqual({ line: "[error] [expiração] falha job=expiração", level: "error" });
  });

  it("nunca grava e-mail, senha, token, CPF nem corpo", () => {
    const { logger, lines } = capture("json");
    logger.info("x", {
      email: "ana@exemplo.com",
      buyerEmail: "ana@exemplo.com",
      password: "segredo123",
      token: "abc",
      cpf: "12345678909",
      body: { name: "Ana" },
      apiKey: "chave-da-api-xyz",
      note: "pedido de ana@exemplo.com, CPF 123.456.789-09, tel (11) 98765-4321",
    });
    const raw = lines[0]!.line;
    for (const bad of [
      "ana@exemplo.com",
      "segredo123",
      "12345678909",
      "123.456.789-09",
      "98765-4321",
      "chave-da-api",
      "Ana",
    ]) {
      expect(raw).not.toContain(bad);
    }
    expect((JSON.parse(raw) as { email: string }).email).toBe("[oculto]");
  });

  it("formato pelo .env: monta em produção e com LOG_FORMAT", () => {
    expect(loggerFromEnv({ NODE_ENV: "production", LOG_FORMAT: undefined })).toBeTruthy();
    expect(loggerFromEnv({ NODE_ENV: "development", LOG_FORMAT: "json" })).toBeTruthy();
  });
});

describe("limpeza", () => {
  it("scrubText troca e-mails e números longos e corta textos grandes", () => {
    expect(scrubText("de ana.b+1@exemplo.com.br")).toBe("de [e-mail]");
    expect(scrubText("cpf 12345678909")).toBe("cpf [número]");
    expect(scrubText("pedido 42 de 3 cotas")).toBe("pedido 42 de 3 cotas");
    expect(scrubText("x".repeat(600)).length).toBe(501);
  });

  it("scrubFields olha objetos aninhados", () => {
    expect(scrubFields({ a: { senha: "x", ok: 1 } })).toEqual({ a: { senha: "[oculto]", ok: 1 } });
  });

  it("describeError: nome, mensagem limpa e começo da pilha", () => {
    const err = Object.assign(new Error("Duplicate entry 'ana@exemplo.com'"), { code: "ER_DUP" });
    const d = describeError(err);
    expect(d.error).toBe("Error");
    expect(d.message).toBe("Duplicate entry '[e-mail]'");
    expect(d.code).toBe("ER_DUP");
    expect(Array.isArray(d.stack)).toBe(true);
  });

  it("logPath esconde tokens, ULIDs e e-mails do caminho", () => {
    expect(logPath("/api/e/dani-gustavo/site")).toBe("/api/e/dani-gustavo/site");
    expect(logPath("/api/e/dani-gustavo/orders/01JABCDEFGHJKMNPQRSTVWXYZ0")).toBe(
      "/api/e/dani-gustavo/orders/:id",
    );
    expect(logPath("/api/team-invites/9f86d081884c7d659a2feaa0c55ad015")).toBe(
      "/api/team-invites/:id",
    );
    expect(logPath("/api/x/ana%40exemplo.com")).toBe("/api/x/:id");
    expect(logPath("/api/admin/events/12/gifts")).toBe("/api/admin/events/12/gifts");
  });

  it("IP só como hash estável de 16 caracteres", () => {
    const h = hashIp("203.0.113.9");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(hashIp("203.0.113.9")).toBe(h);
    expect(hashIp(undefined)).toBeUndefined();
    const headers = new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
    expect(clientIp(headers)).toBe("198.51.100.1");
  });
});
