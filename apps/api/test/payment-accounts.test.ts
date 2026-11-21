import { eq, events, inArray, paymentAccounts, type Database } from "@casamento/db";
import type {
  EventPaymentView,
  OrgPaymentAccountsView,
  PaymentAccountInput,
  PaymentAccountView,
} from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSimulatedProvider } from "../src/payments/simulado.ts";
import type { PaymentProvider, SubaccountInput } from "../src/payments/provider.ts";
import { PaymentProviderError } from "../src/payments/provider.ts";
import {
  createTestEvents,
  retryOnDeadlock,
  testApp,
  type TestEvents,
  type TestUserKind,
} from "./helpers.ts";

// Fase 5, frente C: subconta da organização e do anfitrião, recebedor do evento. O provedor é
// um falso (sem rede); a apiKey que ele devolve nunca pode aparecer em nenhuma resposta.

const API_KEY = "sim_segredo_apikey_DO_PROVEDOR_0123456789";
const calls: SubaccountInput[] = [];
let failNext: PaymentProviderError | null = null;

const base = createSimulatedProvider({ webhookSecret: "x".repeat(40) });
const provider: PaymentProvider = {
  ...base,
  createSubaccount(input) {
    calls.push(input);
    if (failNext) {
      const err = failNext;
      failNext = null;
      return Promise.reject(err);
    }
    return Promise.resolve({
      providerAccountId: `acc_${calls.length}_${Math.random().toString(36).slice(2, 8)}`,
      walletId: `wallet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      apiKey: API_KEY,
      personType: input.personType,
      companyType: input.companyType ?? null,
      status: null,
      raw: {},
    });
  },
};

const { app, db } = testApp({ provider, revalidate: () => Promise.resolve() });

const input = (over: Partial<PaymentAccountInput> = {}): PaymentAccountInput => ({
  personType: "individual",
  name: "Maria Souza",
  document: "52998224725",
  email: "maria@exemplo.com",
  mobilePhone: "11999998888",
  birthDate: "1990-05-10",
  incomeCents: 500_000,
  address: {
    postalCode: "01310100",
    street: "Av. Paulista",
    number: "1000",
    district: "Bela Vista",
  },
  ...over,
});

let ev: TestEvents;
const cookies = {} as Record<TestUserKind, string>;

const call = (kind: TestUserKind, path: string, init: RequestInit = {}) =>
  app.request(path, {
    ...init,
    headers: { "Content-Type": "application/json", cookie: cookies[kind], ...init.headers },
  });
const send = (kind: TestUserKind, method: string, path: string, body?: unknown) =>
  call(kind, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

const orgPath = (orgId: number, rest = "") => `/api/admin/orgs/${orgId}/payment-accounts${rest}`;
const evPath = (eventId: number, rest = "") => `/api/admin/events/${eventId}/payments${rest}`;

/** Apaga o que o teste criou (as contas têm FK restrict para a organização e o evento). */
async function wipe(d: Database, e: TestEvents) {
  const orgIds = [e.orgA.id, e.orgB.id];
  await retryOnDeadlock(async () => {
    await d
      .update(events)
      .set({ paymentReceiver: "organization", receivingAccountId: null })
      .where(inArray(events.organizationId, orgIds));
    await d.delete(paymentAccounts).where(inArray(paymentAccounts.organizationId, orgIds));
  });
}

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger", "platformAdmin"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
});

afterAll(async () => {
  await wipe(db, ev);
  await ev.cleanup();
  await db.$client.end();
});

/** Nenhuma resposta pode conter a apiKey, o token do webhook nem o documento completo. */
async function clean(res: Response) {
  const text = await res.text();
  expect(text).not.toContain(API_KEY);
  expect(text).not.toMatch(/api_?key|apiKeyEnc|webhookToken|walletId|52998224725|529\.982/i);
  expect(text).not.toContain("v1.");
  return text ? JSON.parse(text) : null;
}

describe("conta da organização", () => {
  it("membro e anfitrião não cadastram; estranho recebe 404", async () => {
    expect((await send("member", "POST", orgPath(ev.orgA.id), input())).status).toBe(403);
    expect((await send("host", "POST", orgPath(ev.orgA.id), input())).status).toBe(404);
    expect((await send("stranger", "POST", orgPath(ev.orgA.id), input())).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("valida CPF/CNPJ e dados exigidos antes de chamar o provedor", async () => {
    const badCpf = await send(
      "owner",
      "POST",
      orgPath(ev.orgA.id),
      input({ document: "11111111111" }),
    );
    expect(badCpf.status).toBe(422);
    const noBirth = await send(
      "owner",
      "POST",
      orgPath(ev.orgA.id),
      input({ birthDate: undefined }),
    );
    expect(noBirth.status).toBe(422);
    const badCnpj = await send(
      "owner",
      "POST",
      orgPath(ev.orgA.id),
      input({ personType: "company", document: "11222333000182", companyType: "MEI" }),
    );
    expect(badCnpj.status).toBe(422);
    const noType = await send(
      "owner",
      "POST",
      orgPath(ev.orgA.id),
      input({ personType: "company", document: "11222333000181" }),
    );
    expect(noType.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("falha do provedor não grava nada (422 com a mensagem tratada)", async () => {
    failNext = new PaymentProviderError("CPF já tem conta.", 400);
    const res = await send("owner", "POST", orgPath(ev.orgA.id), input());
    expect(res.status).toBe(422);
    const view = (await (
      await call("owner", orgPath(ev.orgA.id))
    ).json()) as OrgPaymentAccountsView;
    expect(view.organizationAccount).toBeNull();
  });

  let accountId = 0;

  it("o dono cadastra: apiKey cifrada no banco e fora de toda resposta", async () => {
    const res = await send("owner", "POST", orgPath(ev.orgA.id), input());
    expect(res.status).toBe(201);
    const { account } = (await clean(res)) as { account: PaymentAccountView };
    accountId = account.id;
    expect(account.holder).toBe("organization");
    expect(account.documentHint).toContain("247-25");
    expect(account.documentHint).not.toContain("52998224725");
    expect(calls.at(-1)?.webhook.url).toContain("/api/webhooks/payments/accounts/");

    const [row] = await db.select().from(paymentAccounts).where(eq(paymentAccounts.id, accountId));
    expect(row!.apiKeyEnc).toBeTruthy();
    expect(row!.apiKeyEnc).not.toContain(API_KEY);
    expect(row!.webhookTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row!.kyc ?? null)).not.toContain(API_KEY);

    await clean(await call("owner", orgPath(ev.orgA.id)));
    await clean(await call("member", orgPath(ev.orgA.id, `/${accountId}`)));
  });

  it("segunda conta ativa → 409", async () => {
    const res = await send("owner", "POST", orgPath(ev.orgA.id), input());
    expect(res.status).toBe(409);
  });

  it("membro lê; estranho e conta de outra org dão 404", async () => {
    const list = await call("member", orgPath(ev.orgA.id));
    expect(list.status).toBe(200);
    expect(((await list.json()) as OrgPaymentAccountsView).organizationAccount?.id).toBe(accountId);
    expect((await call("stranger", orgPath(ev.orgA.id))).status).toBe(404);
    expect((await call("stranger", orgPath(ev.orgB.id, `/${accountId}`))).status).toBe(404);
    expect((await call("platformAdmin", orgPath(ev.orgB.id, `/${accountId}`))).status).toBe(404);
    const none = (await (
      await call("stranger", orgPath(ev.orgB.id))
    ).json()) as OrgPaymentAccountsView;
    expect(none.organizationAccount).toBeNull();
    expect(none.userAccounts).toEqual([]);
  });

  it("desativar: membro 403, outra org 404, em uso 409, livre 200 e permite cadastrar outra", async () => {
    expect(
      (await send("member", "POST", orgPath(ev.orgA.id, `/${accountId}/disable`))).status,
    ).toBe(403);
    expect((await send("owner", "POST", orgPath(ev.orgB.id, `/${accountId}/disable`))).status).toBe(
      404,
    );

    // Evento A ativo recebe pela conta da org (recebedor `organization`): em uso.
    await db
      .update(events)
      .set({ paymentReceiver: "organization" })
      .where(eq(events.id, ev.eventA.id));
    const busy = await send("owner", "POST", orgPath(ev.orgA.id, `/${accountId}/disable`));
    expect(busy.status).toBe(409);

    await db.update(events).set({ status: "draft" }).where(eq(events.id, ev.eventA.id));
    const ok = await send("owner", "POST", orgPath(ev.orgA.id, `/${accountId}/disable`));
    expect(ok.status).toBe(200);
    const { account } = (await clean(ok)) as { account: PaymentAccountView };
    expect(account.status).toBe("disabled");
    await db.update(events).set({ status: "active" }).where(eq(events.id, ev.eventA.id));

    expect((await send("owner", "POST", orgPath(ev.orgA.id), input())).status).toBe(201);
  });
});

describe("conta do anfitrião", () => {
  const myAccount = (kind: TestUserKind, method = "GET", body?: unknown) =>
    send(kind, method, evPath(ev.eventA.id, "/my-account"), body);
  const allow = (list: string[]) =>
    send("owner", "PUT", `/api/admin/orgs/${ev.orgA.id}/events/${ev.eventA.id}/host-permissions`, {
      deny: [],
      allow: list,
    });

  it("sem a liberação da organização o anfitrião recebe 403", async () => {
    expect((await myAccount("host")).status).toBe(403);
    expect((await myAccount("host", "POST", input({ name: "Anfitrião" }))).status).toBe(403);
  });

  it("estranho (de outra org) recebe 404", async () => {
    expect((await myAccount("stranger")).status).toBe(404);
  });

  it("liberado, cadastra a própria conta; segunda → 409", async () => {
    expect((await allow(["payments.own_account"])).status).toBe(200);
    const empty = (await (await myAccount("host")).json()) as { account: unknown };
    expect(empty.account).toBeNull();
    const res = await myAccount(
      "host",
      "POST",
      input({ name: "Anfitrião", email: "h@exemplo.com" }),
    );
    expect(res.status).toBe(201);
    const { account } = (await clean(res)) as { account: PaymentAccountView };
    expect(account.holder).toBe("user");
    expect(account.user?.id).toBe(ev.users.host.id);
    expect((await myAccount("host", "POST", input())).status).toBe(409);
    const mine = (await clean(await myAccount("host"))) as { account: PaymentAccountView };
    expect(mine.account.id).toBe(account.id);
  });

  it("o anfitrião nunca escolhe o recebedor", async () => {
    const res = await send("host", "PUT", evPath(ev.eventA.id, "/receiver"), {
      receiver: "organization",
    });
    expect(res.status).toBe(403);
  });
});

describe("recebedor do evento", () => {
  const view = async (kind: TestUserKind, eventId = ev.eventA.id) =>
    (await clean(await call(kind, evPath(eventId)))) as EventPaymentView;
  const put = (kind: TestUserKind, body: unknown, eventId = ev.eventA.id) =>
    send(kind, "PUT", evPath(eventId, "/receiver"), body);

  it("anfitrião vê a situação, sem opções nem poder de mudar", async () => {
    const v = await view("host");
    expect(v.canConfigure).toBe(false);
    expect(v.options).toEqual([]);
  });

  it("organização vê as opções: conta da org e a do anfitrião do evento", async () => {
    const v = await view("owner");
    expect(v.canConfigure).toBe(true);
    expect(v.receiver).toBe("organization");
    expect(v.options.map((o) => o.holder).sort()).toEqual(["organization", "user"]);
  });

  it("host: só a conta do anfitrião do evento; outras contas → 422", async () => {
    const v = await view("owner");
    const hostAcc = v.options.find((o) => o.holder === "user")!;
    const orgAcc = v.options.find((o) => o.holder === "organization")!;
    expect((await put("owner", { receiver: "host" })).status).toBe(422);
    expect((await put("owner", { receiver: "host", accountId: orgAcc.id })).status).toBe(422);
    expect((await put("owner", { receiver: "host", accountId: 99999999 })).status).toBe(422);

    // Conta de pessoa que não é anfitriã deste evento (evento B, mesma org não: B é da org B).
    const res = await put("owner", { receiver: "host", accountId: hostAcc.id });
    expect(res.status).toBe(200);
    const after = (await res.json()) as EventPaymentView;
    expect(after.receiver).toBe("host");
    expect(after.account?.id).toBe(hostAcc.id);
    // Conta de outra org nunca entra (o evento B é da org B).
    expect(
      (await put("stranger", { receiver: "host", accountId: hostAcc.id }, ev.eventB.id)).status,
    ).toBe(422);
  });

  it("conta de pessoa que saiu do evento deixa de ser aceita", async () => {
    const v = await view("owner");
    const hostAcc = v.options.find((o) => o.holder === "user")!;
    await db
      .update(paymentAccounts)
      .set({ userId: ev.users.owner.id })
      .where(eq(paymentAccounts.id, hostAcc.id));
    expect((await put("owner", { receiver: "host", accountId: hostAcc.id })).status).toBe(422);
    await db
      .update(paymentAccounts)
      .set({ userId: ev.users.host.id })
      .where(eq(paymentAccounts.id, hostAcc.id));
  });

  it("platform: só platform admin (403 para o dono); volta a organization", async () => {
    expect((await put("owner", { receiver: "platform" })).status).toBe(403);
    const ok = await put("platformAdmin", { receiver: "platform" });
    expect(ok.status).toBe(200);
    const v = (await ok.json()) as EventPaymentView;
    expect(v.state).toBe("platform");
    expect(v.platformFeePercent).toBe(0);
    const back = await put("owner", { receiver: "organization" });
    expect(back.status).toBe(200);
    expect(((await back.json()) as EventPaymentView).receiver).toBe("organization");
  });

  it("estranho recebe 404 e membro lê", async () => {
    expect((await call("stranger", evPath(ev.eventA.id))).status).toBe(404);
    expect((await call("member", evPath(ev.eventA.id))).status).toBe(200);
  });
});

describe("pedidos mostram conta e taxa", () => {
  it("lista de pedidos responde com split nulo-seguro e sem segredos", async () => {
    const res = await call("owner", `/api/admin/events/${ev.eventA.id}/orders`);
    expect(res.status).toBe(200);
    const body = (await clean(res)) as { orders: { split?: unknown }[] };
    for (const o of body.orders) expect(o.split).toBeTruthy();
  });
});
