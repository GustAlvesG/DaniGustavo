import { inArray, paymentAccounts } from "@casamento/db";
import type { PaymentAccountInput, PaymentAccountView } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSimulatedProvider } from "../src/payments/simulado.ts";
import {
  createTestEvents,
  retryOnDeadlock,
  testApp,
  type TestEvents,
  type TestUserKind,
} from "./helpers.ts";

// Integração da Fase 5: rota de desenvolvimento que troca a situação de uma subconta no
// provedor simulado (painel e e2e). Só existe com o simulado fora de produção.

const provider = createSimulatedProvider({ webhookSecret: "s".repeat(40) });
const revalidated: [number, string[]][] = [];
const { app, db } = testApp({
  provider,
  revalidate: (id, tags) => {
    revalidated.push([id, tags]);
    return Promise.resolve();
  },
});

const input: PaymentAccountInput = {
  personType: "individual",
  name: "Conta Simulada",
  document: "52998224725",
  email: "financeiro+pendente@exemplo.com",
  mobilePhone: "11999998888",
  birthDate: "1990-05-10",
  incomeCents: 500_000,
  address: { postalCode: "01310100", street: "Av. Paulista", number: "1000", district: "Centro" },
};

let ev: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
const send = (kind: TestUserKind, path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookies[kind] },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["owner", "member", "host"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
});

afterAll(async () => {
  await retryOnDeadlock(() =>
    db.delete(paymentAccounts).where(inArray(paymentAccounts.organizationId, [ev.orgA.id])),
  );
  await ev.cleanup();
  await db.$client.end();
});

describe("modo simulado: situação da subconta", () => {
  it("dono cadastra pendente, simula aprovação e recusa; membro não simula", async () => {
    const base = `/api/admin/orgs/${ev.orgA.id}/payment-accounts`;
    const created = await send("owner", base, input);
    expect(created.status).toBe(201);
    const { account } = (await created.json()) as { account: PaymentAccountView };
    expect(account.status).toBe("pending");

    const path = `${base}/${account.id}/simulate`;
    expect((await send("member", path, { status: "approved" })).status).toBe(403);
    expect((await send("owner", path, { status: "vencida" })).status).toBe(422);

    const approved = await send("owner", path, { status: "approved" });
    expect(approved.status).toBe(200);
    const a = (await approved.json()) as { account: PaymentAccountView };
    expect(a.account.status).toBe("approved");
    expect(a.account.approvedAt).not.toBeNull();
    // Os eventos da org que recebem pela conta da organização: lista de presentes revalidada.
    expect(revalidated).toContainEqual([ev.eventA.id, ["gifts"]]);
    expect(revalidated.map(([id]) => id)).not.toContain(ev.eventB.id);

    const rejected = await send("owner", path, { status: "rejected" });
    expect(((await rejected.json()) as { account: PaymentAccountView }).account.status).toBe(
      "rejected",
    );
  });

  it("não existe em produção", async () => {
    const prod = testApp(
      { provider, revalidate: () => Promise.resolve() },
      { NODE_ENV: "production", PAYMENT_SECRETS_KEY: "a".repeat(64) },
    );
    const simulateRoutes = prod.app.routes.filter((r) => r.path.endsWith("/simulate"));
    expect(simulateRoutes).toEqual([]);
    await prod.db.$client.end();
  });
});
