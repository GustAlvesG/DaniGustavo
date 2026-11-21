import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PAINEL_CSP, PORTARIA_CSP } from "../src/painel.ts";
import { testApp } from "./helpers.ts";

// Fase 7 (fundação): portaria e portal do fornecedor saem do mesmo build do painel, em caminhos
// próprios; só a portaria libera a câmera (Permissions-Policy) e o vídeo na CSP.

const painelDist = await mkdtemp(join(tmpdir(), "casamento-painel-"));
await writeFile(join(painelDist, "index.html"), "<!doctype html><div id=root></div>");
const { app, db } = testApp({ painelDist });

afterAll(async () => {
  await db.$client.end();
});

describe("páginas sem conta (Fase 7)", () => {
  it("/portaria/ libera a câmera só para a própria origem", async () => {
    const res = await app.request("/portaria/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("id=root");
    expect(res.headers.get("permissions-policy")).toContain("camera=(self)");
    expect(res.headers.get("content-security-policy")).toBe(PORTARIA_CSP);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("/fornecedor/ e /painel/ continuam sem câmera", async () => {
    for (const path of ["/fornecedor/", "/painel/"]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("permissions-policy"), path).toContain("camera=()");
      expect(res.headers.get("content-security-policy"), path).toBe(PAINEL_CSP);
    }
  });

  it("sem barra no fim redireciona", async () => {
    for (const path of ["/portaria", "/fornecedor"]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(301);
      expect(res.headers.get("location"), path).toBe(`${path}/`);
    }
  });

  it("API pública também não libera a câmera", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
  });
});
