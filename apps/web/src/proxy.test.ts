import { NextRequest } from "next/server";
import {
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/** API falsa de `/api/hosts/:host`: só `evento2.localhost:3000` é cadastrado. */
const lookups: string[] = [];
let apiDown = false;

beforeEach(() => {
  lookups.length = 0;
  apiDown = false;
  vi.stubEnv("API_URL", "http://api.test");
  vi.stubGlobal("fetch", (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    lookups.push(url);
    if (apiDown) return Promise.reject(new TypeError("fetch failed"));
    const known = url.endsWith(`/api/hosts/${encodeURIComponent("evento2.localhost:3000")}`);
    return Promise.resolve(new Response(known ? "{}" : "", { status: known ? 200 : 404 }));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("proxy", () => {
  it("reescreve para /<host codificado><caminho>, mantendo a query", async () => {
    const res = await proxy(req("http://evento1.localhost:3000/presentes?x=1"));
    expect(isRewrite(res)).toBe(true);
    expect(getRewrittenUrl(res)).toBe(
      "http://evento1.localhost:3000/evento1.localhost%3A3000/presentes?x=1",
    );
    expect(forwarded(res, "x-event-host")).toBe("evento1.localhost:3000");
  });

  it("X-Forwarded-Host cadastrado (Caddy, redirect de Server Action) vale no lugar do Host", async () => {
    const res = await proxy(
      req("http://localhost:3000/presentes/pagamento/X", {
        "x-forwarded-host": "evento2.localhost:3000, outro",
      }),
    );
    expect(getRewrittenUrl(res)).toBe(
      "http://localhost:3000/evento2.localhost%3A3000/presentes/pagamento/X",
    );
    expect(forwarded(res, "x-event-host")).toBe("evento2.localhost:3000");
    expect(lookups).toContain("http://api.test/api/hosts/evento2.localhost%3A3000");
  });

  it("X-Forwarded-Host forjado (host não cadastrado) é ignorado: vale o Host", async () => {
    const res = await proxy(
      req("http://evento1.localhost:3000/presentes", { "x-forwarded-host": "forjado.exemplo" }),
    );
    expect(forwarded(res, "x-event-host")).toBe("evento1.localhost:3000");
    expect(getRewrittenUrl(res)).toBe(
      "http://evento1.localhost:3000/evento1.localhost%3A3000/presentes",
    );
  });

  it("X-Forwarded-Host inválido ou com a API fora do ar: vale o Host", async () => {
    const bad = await proxy(req("http://localhost:3000/", { "x-forwarded-host": "a b" }));
    expect(forwarded(bad, "x-event-host")).toBe("localhost:3000");
    apiDown = true;
    const down = await proxy(
      req("http://localhost:3000/", { "x-forwarded-host": "fora-do-ar.exemplo" }),
    );
    expect(forwarded(down, "x-event-host")).toBe("localhost:3000");
  });

  it("X-Forwarded-Host igual ao Host não consulta a API", async () => {
    const res = await proxy(req("http://igual.exemplo/", { "x-forwarded-host": "igual.exemplo" }));
    expect(forwarded(res, "x-event-host")).toBe("igual.exemplo");
    expect(lookups.some((u) => u.includes("igual.exemplo"))).toBe(false);
  });

  it("X-Forwarded-Host do PLATFORM_HOST vale sem consulta", async () => {
    vi.stubEnv("PLATFORM_HOST", "plataforma.exemplo");
    const res = await proxy(
      req("http://localhost:3000/precos", { "x-forwarded-host": "plataforma.exemplo" }),
    );
    expect(getRewrittenUrl(res)).toBe("http://localhost:3000/plataforma/precos");
    expect(lookups.some((u) => u.includes("plataforma.exemplo"))).toBe(false);
  });

  it("descarta o x-event-host vindo de fora", async () => {
    const res = await proxy(req("http://localhost:3000/", { "x-event-host": "outro.com" }));
    expect(forwarded(res, "x-event-host")).toBe("localhost:3000");
    expect(getRewrittenUrl(res)).toBe("http://localhost:3000/localhost%3A3000");
  });

  it("caminho interno do próprio host (ícone, OG) não é prefixado de novo; de outro host, é", async () => {
    const own = await proxy(req("http://localhost:3000/localhost%3A3000/icon?abc"));
    expect(getRewrittenUrl(own)).toBe("http://localhost:3000/localhost%3A3000/icon?abc");
    const other = await proxy(req("http://localhost:3000/evento2.localhost%3A3000/presentes"));
    expect(getRewrittenUrl(other)).toBe(
      "http://localhost:3000/localhost%3A3000/evento2.localhost%3A3000/presentes",
    );
  });

  it("Host inválido → 400", async () => {
    const res = await proxy(new NextRequest("http://x/", { headers: { host: "a_b" } }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/inválido/);
  });

  it("Route Handlers em /api seguem sem rewrite, com o header do host", async () => {
    const res = await proxy(req("http://localhost:3000/api/pedidos/X"));
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
      "/sw.js",
      "/offline.html",
      "/api/revalidar",
    ]) {
      expect(matches(url)).toBe(false);
    }
  });
});
