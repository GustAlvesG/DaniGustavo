import { NextRequest } from "next/server";
import {
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { normalizeHost } from "@/lib/host";
import { config, proxy } from "./proxy";

const req = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { headers: { host: new URL(url).host, ...headers } });

/** Header que a rota recebe (o rewrite/next grava como x-middleware-request-*). */
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

describe("normalizeHost", () => {
  it("aceita host com porta e normaliza caixa", () => {
    expect(normalizeHost("Evento1.LocalHost:3000")).toBe("evento1.localhost:3000");
    expect(normalizeHost("dani.com.br")).toBe("dani.com.br");
  });

  it("recusa vazio, caracteres estranhos e o host reserva do build", () => {
    for (const bad of [
      null,
      "",
      "a b",
      "a/b",
      "evil.com@x",
      "x..y",
      ".x",
      "build.invalid",
      "%2e",
    ]) {
      expect(normalizeHost(bad)).toBeNull();
    }
  });
});

describe("proxy", () => {
  it("reescreve para /<host codificado><caminho>, mantendo a query", () => {
    const res = proxy(req("http://evento1.localhost:3000/presentes?x=1"));
    expect(isRewrite(res)).toBe(true);
    expect(getRewrittenUrl(res)).toBe(
      "http://evento1.localhost:3000/evento1.localhost%3A3000/presentes?x=1",
    );
    expect(forwarded(res, "x-event-host")).toBe("evento1.localhost:3000");
  });

  it("descarta o x-event-host vindo de fora", () => {
    const res = proxy(req("http://localhost:3000/", { "x-event-host": "outro.com" }));
    expect(forwarded(res, "x-event-host")).toBe("localhost:3000");
    expect(getRewrittenUrl(res)).toBe("http://localhost:3000/localhost%3A3000");
  });

  it("caminho interno do próprio host (ícone, OG) não é prefixado de novo; de outro host, é", () => {
    const own = proxy(req("http://localhost:3000/localhost%3A3000/icon?abc"));
    expect(getRewrittenUrl(own)).toBe("http://localhost:3000/localhost%3A3000/icon?abc");
    const other = proxy(req("http://localhost:3000/evento2.localhost%3A3000/presentes"));
    expect(getRewrittenUrl(other)).toBe(
      "http://localhost:3000/localhost%3A3000/evento2.localhost%3A3000/presentes",
    );
  });

  it("Host inválido → 400", async () => {
    const res = proxy(new NextRequest("http://x/", { headers: { host: "a_b" } }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/inválido/);
  });

  it("Route Handlers em /api seguem sem rewrite, com o header do host", () => {
    const res = proxy(req("http://localhost:3000/api/pedidos/X"));
    expect(isRewrite(res)).toBe(false);
    expect(forwarded(res, "x-event-host")).toBe("localhost:3000");
  });

  it("matcher deixa de fora estáticos, uploads e /api/revalidar", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    expect(matches("/")).toBe(true);
    expect(matches("/presentes")).toBe(true);
    expect(matches("/api/pedidos/01ABC")).toBe(true);
    expect(matches("/manifest.webmanifest")).toBe(true);
    for (const url of [
      "/_next/static/chunk.js",
      "/uploads/1/a.jpg",
      "/fotos/a.jpg",
      "/placeholder/hero.svg",
      "/sw.js",
      "/offline.html",
      "/api/revalidar",
    ]) {
      expect(matches(url)).toBe(false);
    }
  });
});
