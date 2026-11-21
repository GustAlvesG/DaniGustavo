import {
  account,
  eq,
  inArray,
  legalAcceptances,
  organizationMembers,
  organizations,
  organizationSubscriptions,
  plans,
  signupRequests,
  user,
} from "@casamento/db";
import {
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  type SignupConfirmResult,
  type SignupPreview,
} from "@casamento/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Mailer, MailMessage } from "../src/mailer.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { SIGNUP_EMAIL_LIMIT, SIGNUP_IP_LIMIT } from "../src/routes/signup.ts";
import { slugify } from "../src/signup/service.ts";
import { hashInviteToken } from "../src/team-invites/token.ts";
import { retryOnDeadlock, TEST_WEB_KEY, testApp } from "./helpers.ts";

// Fase 6, frente B: cadastro self-service (pedido, e-mail, confirmação no painel).

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send(message) {
    sent.push(message);
    return Promise.resolve();
  },
};
const rateLimiter = createRateLimiter();
const { app, db, env } = testApp({ mailer, rateLimiter }, { SIGNUP_ENABLED: "1" });
const closedApp = testApp({ mailer }, { SIGNUP_ENABLED: "0" });
const closed = closedApp.app;

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const emails: string[] = [];
let seq = 0;
const freshEmail = (tag: string) => {
  const email = `cadastro-${tag}-${run}-${++seq}@exemplo.com`;
  emails.push(email);
  return email;
};
let ipSeq = 0;
const nextIp = () => `192.0.2.${(++ipSeq % 250) + 1}`;

afterAll(async () => {
  const orgIds = (
    await db
      .select({ id: signupRequests.organizationId })
      .from(signupRequests)
      .where(inArray(signupRequests.email, emails))
  )
    .map((r) => r.id)
    .filter((id): id is number => id !== null);
  await retryOnDeadlock(() =>
    db.delete(signupRequests).where(inArray(signupRequests.email, emails)),
  );
  if (orgIds.length) {
    await retryOnDeadlock(() => db.delete(organizations).where(inArray(organizations.id, orgIds)));
  }
  await retryOnDeadlock(() => db.delete(user).where(inArray(user.email, emails)));
  await db.$client.end();
  await closedApp.db.$client.end();
});

beforeEach(() => {
  sent.length = 0;
  rateLimiter.reset();
});

const signupBody = (email: string, extra: Record<string, unknown> = {}) => ({
  name: "Ana Souza",
  email,
  organizationName: "Ana & Bruno Eventos",
  acceptTerms: true,
  website: "",
  ...extra,
});

function postSignup(body: unknown, ip = nextIp(), target = app) {
  return target.request("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Web-Key": TEST_WEB_KEY, "X-Client-Ip": ip },
    body: JSON.stringify(body),
  });
}

const preview = (token: string) =>
  app.request(`/api/signup/${token}`, { headers: { "X-Forwarded-For": nextIp() } });

const confirm = (
  token: string,
  password = "senha-forte-123",
  headers: Record<string, string> = {},
) =>
  app.request(`/api/signup/${token}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": nextIp(), ...headers },
    body: JSON.stringify({ password }),
  });

/** Token do último e-mail (link `.../painel/#/cadastro/<token>`). */
function lastToken(): string {
  const text = sent.at(-1)?.text ?? "";
  const m = /\/painel\/#\/cadastro\/([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error(`E-mail sem link de cadastro: ${text}`);
  return m[1]!;
}

async function requestFor(email: string, extra: Record<string, unknown> = {}) {
  const res = await postSignup(signupBody(email, extra));
  expect(res.status).toBe(202);
  return lastToken();
}

describe("cadastro fechado", () => {
  it("SIGNUP_ENABLED=0 → 404 de rota em todas", async () => {
    const res = await postSignup(signupBody(freshEmail("fechado")), nextIp(), closed);
    expect(res.status).toBe(404);
    expect((await closed.request("/api/signup/abc")).status).toBe(404);
    expect(sent).toHaveLength(0);
  });
});

describe("pedido de cadastro", () => {
  it("responde 202, grava só o hash do token e manda o link do painel", async () => {
    const email = freshEmail("ok");
    const token = await requestFor(email);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    expect(sent[0]).toMatchObject({
      fromName: "Happy4Ever",
      subject: "Confirme seu e-mail para começar no Happy4Ever",
    });
    expect(sent[0]!.text).toContain(`${env.BETTER_AUTH_URL}/painel/#/cadastro/${token}`);
    const [row] = await db.select().from(signupRequests).where(eq(signupRequests.email, email));
    expect(row!.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row!.termsVersion).toBe(TERMS_VERSION);
    expect(row!.privacyVersion).toBe(PRIVACY_POLICY_VERSION);
    expect(row!.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
  });

  it("exige X-Web-Key (vem do site)", async () => {
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signupBody(freshEmail("sem-chave"))),
    });
    expect(res.status).toBe(401);
  });

  it("honeypot preenchido: 202 sem gravar nem enviar", async () => {
    const email = freshEmail("robo");
    const res = await postSignup(signupBody(email, { website: "http://spam.example" }));
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(0);
    expect(await db.select().from(signupRequests).where(eq(signupRequests.email, email))).toEqual(
      [],
    );
  });

  it("sem aceitar os termos ou com e-mail inválido → 422", async () => {
    expect(
      (await postSignup(signupBody(freshEmail("termos"), { acceptTerms: false }))).status,
    ).toBe(422);
    expect((await postSignup(signupBody("nao-e-email"))).status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  it(`limite por IP: o pedido ${SIGNUP_IP_LIMIT + 1} em 10 min → 429`, async () => {
    const ip = "192.0.2.250";
    for (let i = 0; i < SIGNUP_IP_LIMIT; i++) {
      expect((await postSignup(signupBody(freshEmail("ip")), ip)).status).toBe(202);
    }
    const blocked = await postSignup(signupBody(freshEmail("ip")), ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(sent).toHaveLength(SIGNUP_IP_LIMIT);
  });

  it("limite por e-mail: depois do limite responde 202 sem enviar", async () => {
    const email = freshEmail("bomba");
    for (let i = 0; i < SIGNUP_EMAIL_LIMIT; i++) {
      expect((await postSignup(signupBody(email))).status).toBe(202);
    }
    expect((await postSignup(signupBody(email))).status).toBe(202);
    expect(sent).toHaveLength(SIGNUP_EMAIL_LIMIT);
  });

  it("e-mail que já tem conta: mesma resposta, lembrete de login e nenhum pedido", async () => {
    const email = freshEmail("existe");
    await db.insert(user).values({ id: `u-${run}-existe`, name: "Já tem", email });
    const res = await postSignup(signupBody(email));
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toMatch(/já tem uma conta/);
    expect(sent[0]!.text).not.toMatch(/#\/cadastro\//);
    expect(await db.select().from(signupRequests).where(eq(signupRequests.email, email))).toEqual(
      [],
    );
  });

  it("pedido novo invalida o link anterior", async () => {
    const email = freshEmail("reenvio");
    const first = await requestFor(email);
    const second = await requestFor(email);
    expect((await preview(first)).status).toBe(404);
    expect((await preview(second)).status).toBe(200);
  });
});

describe("confirmação", () => {
  it("cria conta, organização (dono), assinatura em teste e os aceites; o link é de uso único", async () => {
    const email = freshEmail("confirma");
    const token = await requestFor(email);

    const p = await preview(token);
    expect(p.status).toBe(200);
    const pv = (await p.json()) as SignupPreview;
    expect(pv).toMatchObject({
      name: "Ana Souza",
      organizationName: "Ana & Bruno Eventos",
      planName: "Essencial",
    });
    expect(pv.email).not.toBe(email);
    expect(pv.email).toContain("***@exemplo.com");

    const res = await confirm(token);
    expect(res.status).toBe(201);
    const result = (await res.json()) as SignupConfirmResult;
    expect(result.email).toBe(email);

    const [u] = await db.select().from(user).where(eq(user.email, email));
    expect(u!.emailVerified).toBe(true);
    expect(await db.select().from(account).where(eq(account.userId, u!.id))).toHaveLength(1);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, result.organizationId));
    expect(org!.name).toBe("Ana & Bruno Eventos");
    expect(org!.slug).toMatch(/^ana-bruno-eventos/);
    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, result.organizationId));
    expect(members).toEqual([expect.objectContaining({ userId: u!.id, role: "owner" })]);
    const [sub] = await db
      .select({ status: organizationSubscriptions.status, plan: plans.code })
      .from(organizationSubscriptions)
      .innerJoin(plans, eq(plans.id, organizationSubscriptions.planId))
      .where(eq(organizationSubscriptions.organizationId, result.organizationId));
    expect(sub).toEqual({ status: "trialing", plan: "essencial" });
    const accepted = await db
      .select({ document: legalAcceptances.document, version: legalAcceptances.version })
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, u!.id));
    expect(accepted).toEqual(
      expect.arrayContaining([
        { document: "terms", version: TERMS_VERSION },
        { document: "privacy", version: PRIVACY_POLICY_VERSION },
      ]),
    );

    // Entra com a senha nova.
    const login = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": nextIp() },
      body: JSON.stringify({ email, password: "senha-forte-123" }),
    });
    expect(login.status).toBe(200);

    // Uso único.
    expect((await confirm(token)).status).toBe(404);
    expect((await preview(token)).status).toBe(404);
  });

  it("plano escolhido público vale; plano interno cai no padrão", async () => {
    const proEmail = freshEmail("pro");
    const pro = (await (
      await confirm(await requestFor(proEmail, { planCode: "profissional" }))
    ).json()) as SignupConfirmResult;
    const courtesyEmail = freshEmail("cortesia");
    const courtesy = (await (
      await confirm(await requestFor(courtesyEmail, { planCode: "cortesia" }))
    ).json()) as SignupConfirmResult;
    const planOf = async (orgId: number) =>
      (
        await db
          .select({ plan: plans.code })
          .from(organizationSubscriptions)
          .innerJoin(plans, eq(plans.id, organizationSubscriptions.planId))
          .where(eq(organizationSubscriptions.organizationId, orgId))
      )[0]?.plan;
    expect(await planOf(pro.organizationId)).toBe("profissional");
    expect(await planOf(courtesy.organizationId)).toBe("essencial");
  });

  it("token errado, com formato inválido ou expirado → 404", async () => {
    const random = "A".repeat(43);
    expect((await preview(random)).status).toBe(404);
    expect((await confirm(random)).status).toBe(404);
    expect((await preview("lixo")).status).toBe(404);

    const email = freshEmail("expira");
    const token = await requestFor(email);
    await db
      .update(signupRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(signupRequests.email, email));
    expect((await preview(token)).status).toBe(404);
    expect((await confirm(token)).status).toBe(404);
    expect(await db.select().from(user).where(eq(user.email, email))).toEqual([]);
  });

  it("senha curta → 422 e o link continua valendo", async () => {
    const token = await requestFor(freshEmail("senha"));
    expect((await confirm(token, "curta")).status).toBe(422);
    expect((await preview(token)).status).toBe(200);
  });

  it("conta criada com o e-mail depois do pedido → 409 pedindo login", async () => {
    const email = freshEmail("corrida");
    const token = await requestFor(email);
    await db.insert(user).values({ id: `u-${run}-corrida`, name: "Corrida", email });
    const res = await confirm(token);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/Entre/);
  });

  it("confirmação vinda de outra origem → 403", async () => {
    const token = await requestFor(freshEmail("origem"));
    const res = await confirm(token, "senha-forte-123", { Origin: "https://malicioso.example" });
    expect(res.status).toBe(403);
  });
});

describe("slug da organização", () => {
  it("tira acentos e símbolos", () => {
    expect(slugify("Cerimonial São João & Cia.")).toBe("cerimonial-sao-joao-cia");
    expect(slugify("!!!")).toBe("organizacao");
  });
});
