import { and, eq, inArray, paymentAccounts, webhookEvents } from "@casamento/db";
import { KycSnapshot } from "@casamento/shared";
import { ulid } from "ulid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { secretsOf } from "../src/crypto/secret-box.ts";
import type { Mailer, MailMessage } from "../src/mailer.ts";
import { startAccountStatusJob } from "../src/jobs.ts";
import {
  handleAccountWebhook,
  refreshAccountStatus,
  refreshPendingAccounts,
  type AccountStatusDeps,
} from "../src/payment-accounts/status.ts";
import { sealAccountApiKey, type PaymentAccountRow } from "../src/payment-accounts/store.ts";
import {
  PaymentProviderError,
  type AccountCredentials,
  type AccountStatusSnapshot,
  type PaymentProvider,
} from "../src/payments/index.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { createTestEvents, retryOnDeadlock, testApp, type TestEvents } from "./helpers.ts";

// Fase 5, frente D: situação cadastral das subcontas (provedor falso, nunca o Asaas real).

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send(message) {
    sent.push(message);
    return Promise.resolve();
  },
};
const rateLimiter = createRateLimiter();

/** O que o provedor falso responde agora, por apiKey da subconta. */
const answers = new Map<string, AccountStatusSnapshot>();
const calls: string[] = [];

const snapshot = (
  status: AccountStatusSnapshot["status"],
  extra: Partial<KycSnapshot> = {},
): AccountStatusSnapshot => ({
  status,
  raw: {},
  kyc: KycSnapshot.parse({
    general: status,
    commercialInfo: "approved",
    bankAccountInfo: "approved",
    documentation: status === "approved" ? "approved" : "pending",
    documents: [],
    ...extra,
  }),
});

const provider = {
  name: "simulado",
  forAccount(creds: AccountCredentials) {
    return {
      name: "simulado",
      getAccountStatus() {
        calls.push(creds.apiKey);
        const a = answers.get(creds.apiKey);
        if (!a) return Promise.reject(new PaymentProviderError("sem resposta combinada", 503));
        return Promise.resolve(a);
      },
    } as unknown as PaymentProvider;
  },
} as unknown as PaymentProvider;

const { app, db, env } = testApp({
  provider,
  mailer,
  rateLimiter,
  revalidate: () => Promise.resolve(),
});
const secrets = secretsOf({ env });

const NOW = new Date("2027-01-10T12:00:00.000Z");
const deps = (): AccountStatusDeps => ({
  env,
  db,
  provider,
  secrets,
  mailer,
  now: () => NOW,
});

let ev!: TestEvents;
const cookies: Record<string, string> = {};
const created: number[] = [];
let ipSeq = 0;

async function makeAccount(
  orgId: number,
  opts: Partial<typeof paymentAccounts.$inferInsert> = {},
): Promise<{ row: PaymentAccountRow; apiKey: string }> {
  const publicId = ulid();
  const apiKey = `chave-${publicId}`;
  const [res] = await db.insert(paymentAccounts).values({
    organizationId: orgId,
    holder: "organization",
    provider: "simulado",
    publicId,
    providerAccountId: `prov-${publicId}`,
    walletId: `wallet-${publicId}`,
    apiKeyEnc: sealAccountApiKey(secrets, publicId, apiKey),
    personType: "individual",
    name: "Conta de teste",
    email: "conta@exemplo.com",
    documentHint: "•••.•••.789-09",
    status: "pending",
    createdBy: ev.users.member.id,
    ...opts,
  });
  created.push(res.insertId);
  const [row] = await db.select().from(paymentAccounts).where(eq(paymentAccounts.id, res.insertId));
  return { row: row!, apiKey };
}

const reloadRow = async (id: number) =>
  (await db.select().from(paymentAccounts).where(eq(paymentAccounts.id, id)))[0]!;

async function post(url: string, kind: string) {
  return app.request(url, {
    method: "POST",
    headers: { cookie: cookies[kind]!, "X-Forwarded-For": `198.51.100.${(++ipSeq % 250) + 1}` },
  });
}

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["owner", "member", "stranger", "host"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
});

afterAll(async () => {
  if (created.length) {
    await retryOnDeadlock(() =>
      db.delete(paymentAccounts).where(inArray(paymentAccounts.id, created)),
    );
  }
  await ev?.cleanup();
});

beforeEach(() => {
  sent.length = 0;
  calls.length = 0;
  rateLimiter.reset();
});

describe("refreshAccountStatus", () => {
  it("pendente → em análise → aprovada grava situação, kyc e approved_at só na primeira vez", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.set(apiKey, snapshot("awaiting_approval"));
    const v1 = await refreshAccountStatus(deps(), row);
    expect(v1.status).toBe("awaiting_approval");
    expect(v1.approvedAt).toBeNull();
    expect(v1.statusCheckedAt).toBe(NOW.toISOString());

    answers.set(apiKey, snapshot("approved"));
    const v2 = await refreshAccountStatus(deps(), await reloadRow(row.id));
    expect(v2.status).toBe("approved");
    expect(v2.approvedAt).toBe(NOW.toISOString());

    // O provedor volta a pedir algo: o status acompanha o provedor; approved_at não muda.
    answers.set(apiKey, snapshot("pending"));
    const v3 = await refreshAccountStatus(deps(), await reloadRow(row.id));
    expect(v3.status).toBe("pending");
    expect(v3.approvedAt).toBe(NOW.toISOString());
  });

  it("aprovada continua aprovada enquanto o provedor disser aprovada", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id, { status: "approved", approvedAt: NOW });
    answers.set(apiKey, snapshot("approved"));
    expect((await refreshAccountStatus(deps(), row)).status).toBe("approved");
    expect(sent).toHaveLength(0);
  });

  it("e-mail só quando a situação muda, para quem cadastrou e donos, sem repetir", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.set(apiKey, snapshot("pending"));
    await refreshAccountStatus(deps(), row);
    expect(sent).toHaveLength(0); // pendente → pendente

    answers.set(
      apiKey,
      snapshot("rejected", {
        rejectReason: "Documento ilegível",
        documents: [
          {
            id: "d1",
            type: "IDENTIFICATION",
            title: "Documento de identificação",
            description: null,
            status: "rejected",
            onboardingUrl: "https://exemplo.invalid/onboarding",
            onboardingUrlExpiresAt: null,
          },
        ],
      }),
    );
    await refreshAccountStatus(deps(), await reloadRow(row.id));
    const to = sent.map((m) => m.to).sort();
    expect(to).toEqual(
      [ev.users.member.email, ev.users.owner.email].map((e) => e.toLowerCase()).sort(),
    );
    expect(sent[0]!.subject).toContain("recusada");
    expect(sent[0]!.text).toContain("Documento ilegível");
    expect(sent[0]!.text).toContain(`/painel/#/o/${ev.orgA.id}/recebimentos`);
    expect(sent.some((m) => m.to === ev.users.stranger.email.toLowerCase())).toBe(false);

    sent.length = 0;
    await refreshAccountStatus(deps(), await reloadRow(row.id)); // mesma situação
    expect(sent).toHaveLength(0);
  });

  it("falha de e-mail não derruba a atualização", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.set(apiKey, snapshot("approved"));
    const broken: Mailer = { send: () => Promise.reject(new Error("smtp fora")) };
    const view = await refreshAccountStatus({ ...deps(), mailer: broken }, row);
    expect(view.status).toBe("approved");
  });

  it("conta desativada não muda nem chama o provedor", async () => {
    const { row } = await makeAccount(ev.orgA.id, { status: "disabled", disabledAt: NOW });
    const view = await refreshAccountStatus(deps(), row);
    expect(view.status).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  it("o kyc gravado não carrega segredo", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.set(apiKey, snapshot("pending"));
    await refreshAccountStatus(deps(), row);
    const saved = await reloadRow(row.id);
    const text = JSON.stringify(saved.kyc);
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain(row.walletId!);
    expect(KycSnapshot.safeParse(saved.kyc).success).toBe(true);
  });
});

describe("handleAccountWebhook", () => {
  it("é idempotente por id do evento e só consulta o provedor uma vez", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.set(apiKey, snapshot("approved"));
    const notice = { eventId: `evt-${ulid()}`, type: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED" };
    await handleAccountWebhook(deps(), row, notice);
    await handleAccountWebhook(deps(), await reloadRow(row.id), notice);
    expect(calls).toHaveLength(1);
    expect((await reloadRow(row.id)).status).toBe("approved");
    expect(sent.length).toBeGreaterThan(0);
    const n = sent.length;
    await handleAccountWebhook(deps(), await reloadRow(row.id), notice);
    expect(sent).toHaveLength(n);
    await db.delete(webhookEvents).where(eq(webhookEvents.eventId, notice.eventId));
  });

  it("falha do provedor deixa o aviso sem processar (o provedor reenvia)", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.delete(apiKey);
    const notice = { eventId: `evt-${ulid()}`, type: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED" };
    await expect(handleAccountWebhook(deps(), row, notice)).rejects.toThrow();
    const [w] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, notice.eventId));
    expect(w?.processedAt).toBeNull();
    answers.set(apiKey, snapshot("approved"));
    await handleAccountWebhook(deps(), row, notice);
    expect((await reloadRow(row.id)).status).toBe("approved");
    await db.delete(webhookEvents).where(eq(webhookEvents.eventId, notice.eventId));
  });
});

describe("rotina de situação", () => {
  it("consulta pendentes, em análise e recusadas; não toca aprovadas nem desativadas; uma falha não para as outras", async () => {
    const pending = await makeAccount(ev.orgA.id, { holder: "user", userId: ev.users.host.id });
    const review = await makeAccount(ev.orgB.id, { status: "awaiting_approval" });
    const broken = await makeAccount(ev.orgB.id, { holder: "user", userId: ev.users.stranger.id });
    const approved = await makeAccount(ev.orgA.id, { status: "approved", approvedAt: NOW });
    const off = await makeAccount(ev.orgA.id, {
      holder: "user",
      userId: ev.users.member.id,
      disabledAt: NOW,
      status: "disabled",
    });
    const noKey = await makeAccount(ev.orgA.id, {
      holder: "user",
      userId: ev.users.platformAdmin.id,
      apiKeyEnc: null,
    });
    answers.set(pending.apiKey, snapshot("approved"));
    answers.set(review.apiKey, snapshot("awaiting_approval"));
    answers.delete(broken.apiKey);
    answers.set(approved.apiKey, snapshot("pending"));

    const n = await refreshPendingAccounts(deps());
    expect(n).toBeGreaterThanOrEqual(2);
    expect(calls).toContain(pending.apiKey);
    expect(calls).toContain(review.apiKey);
    expect(calls).toContain(broken.apiKey);
    expect(calls).not.toContain(approved.apiKey);
    expect(calls).not.toContain(off.apiKey);
    expect(calls).not.toContain(noKey.apiKey);
    expect((await reloadRow(pending.row.id)).status).toBe("approved");
    expect((await reloadRow(approved.row.id)).status).toBe("approved");
    expect((await reloadRow(review.row.id)).statusCheckedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("startAccountStatusJob roda no intervalo e para ao ser desligado", async () => {
    const stop = startAccountStatusJob(deps(), 20);
    await new Promise((r) => setTimeout(r, 90));
    stop();
    // Deixa a rodada em andamento terminar (o banco pode estar ocupado): estável por 300 ms.
    let before = -1;
    while (before !== calls.length) {
      before = calls.length;
      await new Promise((r) => setTimeout(r, 300));
    }
    await new Promise((r) => setTimeout(r, 100)); // 5 intervalos sem nova rodada
    expect(calls.length).toBe(before);
  });
});

describe("POST refresh (rotas)", () => {
  const orgRefresh = (orgId: number, id: number) =>
    `/api/admin/orgs/${orgId}/payment-accounts/${id}/refresh`;

  it("sem sessão 401; estranho à org 404; conta de outra org 404", async () => {
    const { row } = await makeAccount(ev.orgA.id);
    const anon = await app.request(orgRefresh(ev.orgA.id, row.id), { method: "POST" });
    expect(anon.status).toBe(401);
    expect((await post(orgRefresh(ev.orgA.id, row.id), "stranger")).status).toBe(404);
    // Dono da org B pedindo a conta da org A pela URL da org B: não existe lá.
    expect((await post(orgRefresh(ev.orgB.id, row.id), "stranger")).status).toBe(404);
    // Membro da org A pela URL da org B: 404 (sem vínculo).
    expect((await post(orgRefresh(ev.orgB.id, row.id), "member")).status).toBe(404);
  });

  it("membro e dono atualizam; a resposta não traz segredo", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.set(apiKey, snapshot("approved"));
    const res = await post(orgRefresh(ev.orgA.id, row.id), "member");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text).account.status).toBe("approved");
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain(row.walletId!);
    expect(text).not.toContain(row.publicId);
    expect((await post(orgRefresh(ev.orgA.id, row.id), "owner")).status).toBe(200);
  });

  it("provedor fora do ar vira 502 em pt-BR, sem vazar detalhes", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.delete(apiKey);
    const res = await post(orgRefresh(ev.orgA.id, row.id), "owner");
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain("provedor de pagamento");
    expect(text).not.toContain("sem resposta combinada");
    expect(text).not.toContain(apiKey);
  });

  it("limita a 20 por minuto por usuário (429)", async () => {
    const { row, apiKey } = await makeAccount(ev.orgA.id);
    answers.set(apiKey, snapshot("pending"));
    let last = 200;
    for (let i = 0; i < 21; i++)
      last = (await post(orgRefresh(ev.orgA.id, row.id), "member")).status;
    expect(last).toBe(429);
    // Outro usuário tem o próprio limite.
    expect((await post(orgRefresh(ev.orgA.id, row.id), "owner")).status).toBe(200);
  });

  it("evento: conta própria do usuário; sem conta 404; anfitrião sem liberação 403", async () => {
    const url = `/api/admin/events/${ev.eventA.id}/payments/my-account/refresh`;
    expect((await post(url, "owner")).status).toBe(404); // dono sem conta própria
    const mine = await makeAccount(ev.orgA.id, { holder: "user", userId: ev.users.owner.id });
    answers.set(mine.apiKey, snapshot("approved"));
    const res = await post(url, "owner");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { account: { id: number } }).account.id).toBe(mine.row.id);
    expect((await post(url, "host")).status).toBe(403);
    expect((await post(url, "stranger")).status).toBe(404);
  });

  it("a conta da org B nunca é lida pela org A (consulta por organização)", async () => {
    const other = await makeAccount(ev.orgB.id);
    const rows = await db
      .select({ id: paymentAccounts.id })
      .from(paymentAccounts)
      .where(
        and(eq(paymentAccounts.organizationId, ev.orgA.id), eq(paymentAccounts.id, other.row.id)),
      );
    expect(rows).toHaveLength(0);
  });
});
