import { afterAll, describe, expect, it } from "vitest";
import { safeEqual } from "../src/middleware/web-key.ts";
import { TEST_WEB_KEY, testApp } from "./helpers.ts";

const { app, db } = testApp();

afterAll(async () => {
  await db.$client.end();
});

describe("GET /api/health", () => {
  it("responde 200", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("middleware X-Web-Key", () => {
  it("recusa escrita sem a chave com 401 em JSON", async () => {
    const res = await app.request("/api/rota-qualquer", { method: "POST" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("recusa chave errada", async () => {
    const res = await app.request("/api/rota-qualquer", {
      method: "PUT",
      headers: { "X-Web-Key": "errada" },
    });
    expect(res.status).toBe(401);
  });

  it("deixa passar com a chave certa", async () => {
    const res = await app.request("/api/rota-qualquer", {
      method: "POST",
      headers: { "X-Web-Key": TEST_WEB_KEY },
    });
    // Passou do middleware e caiu no 404 de rota inexistente.
    expect(res.status).toBe(404);
  });

  it("não exige a chave em leituras", async () => {
    const res = await app.request("/api/rota-qualquer");
    expect(res.status).toBe(404);
  });

  it("isenta os webhooks", async () => {
    const res = await app.request("/api/webhooks/qualquer", { method: "POST" });
    expect(res.status).not.toBe(401);
  });
});

describe("safeEqual", () => {
  it("compara strings de tamanhos diferentes sem lançar erro", () => {
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});
