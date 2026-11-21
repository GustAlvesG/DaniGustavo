import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { siteCsp, siteSecurityHeaders } from "./security-headers";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d === name || d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1);

describe("CSP do site", () => {
  const csp = siteCsp({ dev: false });

  it("só scripts, estilos, fontes e conexões da própria origem", () => {
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
    expect(directive(csp, "font-src")).toEqual(["'self'"]);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("libera fotos de /uploads, QR em data URI e blob, e o service worker", () => {
    expect(directive(csp, "img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(directive(csp, "worker-src")).toEqual(["'self'"]);
  });

  it("fecha iframe, <object>, <base> e formulários de fora", () => {
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
    expect(directive(csp, "upgrade-insecure-requests")).toEqual([]);
  });

  it("em dev: eval e WebSocket do HMR, sem upgrade-insecure-requests", () => {
    const dev = siteCsp({ dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toEqual(["'self'", "ws:", "wss:"]);
    expect(directive(dev, "upgrade-insecure-requests")).toBeUndefined();
  });

  it("não repete o que o edge envia (HSTS, nosniff, Referrer-Policy)", () => {
    const keys = siteSecurityHeaders({ dev: false }).map((h) => h.key.toLowerCase());
    expect(keys).toContain("content-security-policy");
    expect(keys).toContain("permissions-policy");
    for (const k of ["strict-transport-security", "x-content-type-options", "referrer-policy"]) {
      expect(keys).not.toContain(k);
    }
  });

  it("next.config aplica os cabeçalhos em todas as rotas", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((r) => r.source === "/:path*");
    expect(all?.headers.map((h) => h.key)).toContain("Content-Security-Policy");
  });
});
