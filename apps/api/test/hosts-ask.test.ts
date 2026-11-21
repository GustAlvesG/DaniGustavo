import { eventDomains } from "@casamento/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEvents, testApp, type TestEvents } from "./helpers.ts";

// Fase 6, frente B: `ask` do on-demand TLS do Caddy (GET /api/hosts/ask?domain=<host>).

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PLATFORM_HOST = `plataforma-${run}.teste.local:3000`;
const { app, db } = testApp({}, { PLATFORM_HOST });

let ev!: TestEvents;
const draftHost = `rascunho-${run}.teste.local`;
const unverifiedHost = `pendente-${run}.com.br`;
const otherHost = `b-${run}.teste.local`;
const subdomain = `${run}.eventos.teste.local`;

beforeAll(async () => {
  ev = await createTestEvents(db);
  await db.insert(eventDomains).values([
    { eventId: ev.draftA.id, host: draftHost, isPrimary: true },
    {
      eventId: ev.eventA.id,
      host: unverifiedHost,
      kind: "custom",
      verificationToken: "plataforma-x",
      verifiedAt: null,
    },
    { eventId: ev.eventB.id, host: otherHost, isPrimary: true },
    { eventId: ev.eventB.id, host: subdomain, kind: "platform" },
  ]);
});

afterAll(async () => {
  await ev?.cleanup();
  await db.$client.end();
});

const ask = (domain?: string) =>
  app.request(
    `/api/hosts/ask${domain === undefined ? "" : `?domain=${encodeURIComponent(domain)}`}`,
  );

describe("ask do Caddy", () => {
  it("200 para domínio verificado de evento ativo (inclusive de outra org e subdomínio da base)", async () => {
    for (const host of [ev.primaryHostA, ev.secondaryHostA, otherHost, subdomain]) {
      const res = await ask(host);
      expect(res.status, host).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    // Maiúsculas e ponto final (FQDN) normalizados.
    expect((await ask(`${otherHost.toUpperCase()}.`)).status).toBe(200);
  });

  it("200 para o host da plataforma, com ou sem a porta", async () => {
    expect((await ask(PLATFORM_HOST)).status).toBe(200);
    expect((await ask(PLATFORM_HOST.replace(/:\d+$/, ""))).status).toBe(200);
  });

  it("404 para não verificado, rascunho, desconhecido e lixo", async () => {
    for (const host of [
      unverifiedHost,
      draftHost,
      `nada-${run}.com`,
      "",
      "a b",
      "x..y",
      undefined,
    ]) {
      expect((await ask(host)).status, String(host)).toBe(404);
    }
  });

  it("não exige chave nem sessão e não confunde com /api/hosts/:host", async () => {
    const res = await app.request(`/api/hosts/${encodeURIComponent(unverifiedHost)}`);
    expect(res.status).toBe(404);
    const ok = await app.request(`/api/hosts/${encodeURIComponent(otherHost)}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: ev.eventB.id, primaryHost: otherHost });
  });
});
