import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "@casamento/db";
import { afterAll, describe, expect, it } from "vitest";
import type { AlertInput, Alerter } from "../src/alerts.ts";
import { createLogger } from "../src/log.ts";
import { PAINEL_CSP } from "../src/painel.ts";
import { testApp } from "./helpers.ts";

// Fase 6, frente D: /api/health (com e sem banco), cabeçalhos de segurança e 5xx → log + alerta.

const painelDist = await mkdtemp(join(tmpdir(), "casamento-painel-"));
await writeFile(join(painelDist, "index.html"), "<!doctype html><div id=root></div>");

const lines: string[] = [];
const alerts: AlertInput[] = [];
const alerter: Alerter = {
  notify(a) {
    alerts.push(a);
    return Promise.resolve(true);
  },
};
const logger = createLogger({ format: "json", write: (l) => lines.push(l) });

const { app, db } = testApp({ painelDist, logger, alerts: alerter });
// Rota que falha, só para o teste do 500 (registrada antes da primeira requisição).
app.get("/api/teste-explode", () => {
  throw new Error("falhou para ana@exemplo.com com CPF 123.456.789-09");
});

/** Mesmo app, com um banco que não responde. */
const broken = {
  execute: () => Promise.reject(new Error("connect ECONNREFUSED")),
} as unknown as Database;
const down = testApp({ db: broken, logger: createLogger({ format: "json", write: () => {} }) });

afterAll(async () => {
  await db.$client.end();
  await down.db.$client.end();
});

describe("GET /api/health", () => {
  it("sem parâmetro: só o processo, mesmo com o banco fora (healthcheck do Docker)", async () => {
    const res = await down.app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("?db=1 com o banco no ar → 200 com db ok", async () => {
    const res = await app.request("/api/health?db=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("?db=1 com o banco fora → 503", async () => {
    const res = await down.app.request("/api/health?db=1");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error", db: "error" });
  });
});

describe("cabeçalhos de segurança", () => {
  it("API: CSP fechada, nosniff, sem HSTS (fica no edge)", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
    expect(res.headers.get("content-security-policy")).toMatch(/frame-ancestors 'none'/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("permissions-policy")).toMatch(/camera=\(\)/);
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });

  it("painel: CSP própria, script só da origem e sem unsafe-inline em script", async () => {
    const res = await app.request("/painel/");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toBe(PAINEL_CSP);
    const script = csp.split("; ").find((d) => d.startsWith("script-src "));
    expect(script).toBe("script-src 'self'");
    expect(csp).toMatch(/img-src 'self' data: blob:/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });
});

describe("log por requisição e alerta de 5xx", () => {
  it("500 vira linha JSON sem dado pessoal e um alerta", async () => {
    lines.length = 0;
    alerts.length = 0;
    const res = await app.request("/api/teste-explode?email=ana@exemplo.com", {
      headers: { "x-real-ip": "203.0.113.9" },
    });
    expect(res.status).toBe(500);
    const entry = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((e) => e.status === 500);
    expect(entry).toMatchObject({
      level: "error",
      msg: "request",
      method: "GET",
      path: "/api/teste-explode",
    });
    expect(entry?.ip).toMatch(/^[0-9a-f]{16}$/);
    const raw = lines.join("\n");
    expect(raw).not.toContain("ana@exemplo.com");
    expect(raw).not.toContain("123.456.789-09");
    expect(raw).not.toContain("203.0.113.9");
    expect(raw).not.toContain("email=");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.key).toBe("http:500:GET /api/teste-explode");
  });

  it("requisição comum vira linha info; o /api/health não entra no log", async () => {
    lines.length = 0;
    await app.request("/api/health");
    await app.request("/api/hosts/nao-existe.exemplo");
    const entries = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(entries.some((e) => e.path === "/api/health")).toBe(false);
    expect(entries.find((e) => e.path === "/api/hosts/nao-existe.exemplo")).toMatchObject({
      level: "info",
      status: 404,
    });
  });
});
