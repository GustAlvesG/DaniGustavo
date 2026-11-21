import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import type { VendorPortalLinkCreated } from "@casamento/shared";
import type { MailMessage, Mailer } from "../src/mailer.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

/*
 * Fase 7, frente C: fixture dos testes do portal do fornecedor. Evento A (org A) com dois
 * fornecedores (A1 com e-mail no catálogo, A2 sem); evento B (org B, `stranger` é o dono) com B1.
 */

export interface PortalFixture {
  app: ReturnType<typeof testApp>["app"];
  db: ReturnType<typeof testApp>["db"];
  t: TestEvents;
  sent: MailMessage[];
  /** Faz o próximo envio de e-mail falhar. */
  failNextMail(): void;
  uploadDir: string;
  cookies: Record<TestUserKind, string>;
  /** ids de `event_vendors`. */
  a1: number;
  a2: number;
  b1: number;
  call(
    kind: TestUserKind,
    url: string,
    method?: string,
    body?: unknown,
  ): Response | Promise<Response>;
  evUrl(eventId: number, path?: string): string;
  /** Gera um link pelo painel e devolve o token (tirado do endereço). */
  newLink(
    kind: TestUserKind,
    eventId: number,
    eventVendorId: number,
    body?: unknown,
  ): Promise<{ token: string; created: VendorPortalLinkCreated }>;
  portal(token: string | null, path: string, init?: RequestInit): Response | Promise<Response>;
  cleanup(): Promise<void>;
}

export async function portalFixture(name: string): Promise<PortalFixture> {
  const sent: MailMessage[] = [];
  let fail = false;
  const mailer: Mailer = {
    send(m) {
      if (fail) {
        fail = false;
        return Promise.reject(new Error("SMTP fora do ar"));
      }
      sent.push(m);
      return Promise.resolve();
    },
  };
  const uploadDir = await mkdtemp(join(tmpdir(), `casamento-${name}-`));
  const { app, db } = testApp(
    { mailer, revalidate: () => Promise.resolve() },
    { UPLOAD_DIR: uploadDir },
  );
  const t = await createTestEvents(db);
  const cookies = {} as Record<TestUserKind, string>;
  for (const k of ["host", "owner", "member", "stranger"] as const) {
    cookies[k] = await t.login(app, k);
  }
  const call = (kind: TestUserKind, url: string, method = "GET", body?: unknown) =>
    app.request(url, {
      method,
      headers: { cookie: cookies[kind], "Content-Type": "application/json" },
      body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
    });
  const evUrl = (eventId: number, path = "") => `/api/admin/events/${eventId}${path}`;

  const vendor = async (
    kind: TestUserKind,
    orgId: number,
    eventId: number,
    vendorName: string,
    email?: string,
  ) => {
    const res = await call(kind, `/api/admin/orgs/${orgId}/vendors`, "POST", {
      name: vendorName,
      category: "buffet",
      ...(email ? { email } : {}),
    });
    expect(res.status).toBe(201);
    const { vendor: v } = (await res.json()) as { vendor: { id: number } };
    const linked = await call(kind, evUrl(eventId, "/vendors"), "POST", { vendorId: v.id });
    expect(linked.status).toBe(201);
    return ((await linked.json()) as { vendor: { id: number } }).vendor.id;
  };

  const a1 = await vendor("owner", t.orgA.id, t.eventA.id, `Buffet Sabor ${t.run}`, "sabor@x.com");
  const a2 = await vendor("owner", t.orgA.id, t.eventA.id, `Foto Luz ${t.run}`);
  const b1 = await vendor("stranger", t.orgB.id, t.eventB.id, `Som Bê ${t.run}`, "som@x.com");

  const newLink: PortalFixture["newLink"] = async (kind, eventId, eventVendorId, body = {}) => {
    const res = await call(
      kind,
      evUrl(eventId, `/vendors/${eventVendorId}/portal-links`),
      "POST",
      body,
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as VendorPortalLinkCreated;
    const token = created.url.split("#")[1]!;
    return { token, created };
  };

  let ipSeq = 0;
  const portal = (token: string | null, path: string, init: RequestInit = {}) =>
    app.request(`/api/vendor-portal${path}`, {
      ...init,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        // IP próprio por chamada: os testes não esbarram no limite por IP.
        "X-Real-IP": `198.51.100.${(ipSeq++ % 250) + 1}`,
        ...(init.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });

  return {
    app,
    db,
    t,
    sent,
    failNextMail: () => {
      fail = true;
    },
    uploadDir,
    cookies,
    a1,
    a2,
    b1,
    call,
    evUrl,
    newLink,
    portal,
    async cleanup() {
      await t.cleanup();
      await db.$client.end();
      await rm(uploadDir, { recursive: true, force: true });
    },
  };
}
