import {
  and,
  eq,
  eventMembers,
  inArray,
  organizationMembers,
  teamInvites,
  user,
} from "@casamento/db";
import type { AcceptTeamInviteResult, TeamInvite, TeamInvitePreview } from "@casamento/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Mailer, MailMessage } from "../src/mailer.ts";
import { createRateLimiter } from "../src/rate-limit.ts";
import { hashInviteToken, maskEmail } from "../src/team-invites/token.ts";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 3, frente B: equipe da organização, convites por e-mail e aceite.

const sent: MailMessage[] = [];
const mailer: Mailer = {
  send(message) {
    sent.push(message);
    return Promise.resolve();
  },
};
const rateLimiter = createRateLimiter();
const { app, db, env } = testApp({ mailer, rateLimiter, revalidate: () => Promise.resolve() });

let ev!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;
/** E-mails das contas criadas pelos aceites (apagadas no fim). */
const createdEmails: string[] = [];
let ipSeq = 0;
const nextIp = () => `198.51.100.${(++ipSeq % 250) + 1}`;

beforeAll(async () => {
  ev = await createTestEvents(db);
  for (const kind of ["owner", "member", "stranger", "host", "platformAdmin"] as const) {
    cookies[kind] = await ev.login(app, kind);
  }
});

afterAll(async () => {
  if (createdEmails.length) await db.delete(user).where(inArray(user.email, createdEmails));
  await ev?.cleanup();
});

beforeEach(() => {
  sent.length = 0;
  rateLimiter.reset();
});

const orgUrl = (orgId: number, path = "") => `/api/admin/orgs/${orgId}${path}`;

async function call(method: string, url: string, cookie: string | null, body?: unknown) {
  const headers: Record<string, string> = { "X-Forwarded-For": nextIp() };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const freshEmail = (tag: string) => {
  const email = `convite-${tag}-${ev.run}-${Math.random().toString(36).slice(2, 7)}@exemplo.com`;
  createdEmails.push(email);
  return email;
};

/** Token do último e-mail enviado (o link é .../painel/#/aceitar/<token>). */
function lastToken(): string {
  const text = sent.at(-1)?.text ?? "";
  const m = /\/painel\/#\/aceitar\/([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error(`E-mail sem link de convite: ${text}`);
  return m[1]!;
}

async function inviteTeam(email: string, role: "owner" | "member" = "member") {
  const res = await call("POST", orgUrl(ev.orgA.id, "/invites"), cookies.owner, { email, role });
  expect(res.status).toBe(201);
  const { invite } = (await res.json()) as { invite: TeamInvite };
  return { invite, token: lastToken() };
}

async function inviteHost(email: string, kind: TestUserKind = "owner") {
  const res = await call(
    "POST",
    orgUrl(ev.orgA.id, `/events/${ev.eventA.id}/hosts`),
    cookies[kind],
    { email },
  );
  expect(res.status).toBe(201);
  const { invite } = (await res.json()) as { invite: TeamInvite };
  return { invite, token: lastToken() };
}

const accept = (token: string, body: unknown = {}, cookie: string | null = null) =>
  call("POST", `/api/team-invites/${token}/accept`, cookie, body);

async function signIn(email: string, password: string) {
  return app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": nextIp() },
    body: JSON.stringify({ email, password }),
  });
}

describe("convites da equipe", () => {
  it("grava só o hash do token e manda o e-mail com o link do painel", async () => {
    const email = freshEmail("hash");
    const { invite, token } = await inviteTeam(email);
    expect(invite).toMatchObject({ email, role: "member", status: "pending", eventId: null });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    expect(sent[0]!.text).toContain(`${env.BETTER_AUTH_URL}/painel/#/aceitar/${token}`);
    const [row] = await db
      .select()
      .from(teamInvites)
      .where(and(eq(teamInvites.id, invite.id), eq(teamInvites.organizationId, ev.orgA.id)));
    expect(row!.tokenHash).toBe(hashInviteToken(token));
    expect(row!.tokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);
    const days = (row!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("convite repetido para o mesmo e-mail reaproveita a linha e troca o token", async () => {
    const email = freshEmail("repetido");
    const first = await inviteTeam(email);
    const second = await inviteTeam(email, "owner");
    expect(second.invite.id).toBe(first.invite.id);
    expect(second.invite.role).toBe("owner");
    expect((await call("GET", `/api/team-invites/${first.token}`, null)).status).toBe(404);
    expect((await call("GET", `/api/team-invites/${second.token}`, null)).status).toBe(200);
  });

  it("membro lista convites, mas não convida para a equipe (403)", async () => {
    const list = await call("GET", orgUrl(ev.orgA.id, "/invites"), cookies.member);
    expect(list.status).toBe(200);
    const res = await call("POST", orgUrl(ev.orgA.id, "/invites"), cookies.member, {
      email: freshEmail("membro"),
    });
    expect(res.status).toBe(403);
  });

  it("recusa convidar quem já está na equipe e e-mail inválido", async () => {
    const dup = await call("POST", orgUrl(ev.orgA.id, "/invites"), cookies.owner, {
      email: ev.users.member.email,
    });
    expect(dup.status).toBe(409);
    const bad = await call("POST", orgUrl(ev.orgA.id, "/invites"), cookies.owner, {
      email: "nao-e-email",
    });
    expect(bad.status).toBe(422);
  });

  it("prévia mascara o e-mail sem sessão e o aceite cria a conta com senha", async () => {
    const email = freshEmail("nova");
    const { token } = await inviteTeam(email);
    const prev = await call("GET", `/api/team-invites/${token}`, null);
    expect(prev.status).toBe(200);
    const preview = (await prev.json()) as TeamInvitePreview;
    expect(preview).toMatchObject({
      organizationName: expect.stringContaining("Org a"),
      eventName: null,
      role: "member",
      email: maskEmail(email),
      accountExists: false,
    });
    expect(preview.email).not.toBe(email);

    expect((await accept(token, {})).status).toBe(422);
    expect((await accept(token, { name: "Nova", password: "curta" })).status).toBe(422);

    const res = await accept(token, { name: "Nova Pessoa", password: "senha-forte-123" });
    expect(res.status).toBe(201);
    const result = (await res.json()) as AcceptTeamInviteResult;
    expect(result).toEqual({ created: true, email, organizationId: ev.orgA.id, eventId: null });

    const [created] = await db.select().from(user).where(eq(user.email, email));
    expect(created).toMatchObject({ name: "Nova Pessoa", emailVerified: true, platformRole: null });
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, ev.orgA.id),
          eq(organizationMembers.userId, created!.id),
        ),
      );
    expect(member?.role).toBe("member");
    expect((await signIn(email, "senha-forte-123")).status).toBe(200);

    // Uso único: o mesmo link não serve de novo, nem para ver.
    expect((await accept(token, { name: "X", password: "senha-forte-123" })).status).toBe(404);
    expect((await call("GET", `/api/team-invites/${token}`, null)).status).toBe(404);
    const list = await call("GET", orgUrl(ev.orgA.id, "/invites"), cookies.owner);
    const { invites } = (await list.json()) as { invites: TeamInvite[] };
    expect(invites.some((i) => i.email === email)).toBe(false);
  });

  it("token errado, expirado, revogado ou trocado pelo reenvio dão o mesmo 404", async () => {
    const notFound = async (token: string) => {
      const res = await call("GET", `/api/team-invites/${token}`, null);
      expect(res.status).toBe(404);
      const acc = await accept(token, { name: "X", password: "senha-forte-123" });
      expect(acc.status).toBe(404);
      return ((await res.json()) as { error: { message: string } }).error.message;
    };
    const messages = new Set<string>();
    messages.add(await notFound("lixo"));
    messages.add(await notFound("a".repeat(43)));

    const expired = await inviteTeam(freshEmail("expirado"));
    await db
      .update(teamInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(eq(teamInvites.id, expired.invite.id), eq(teamInvites.organizationId, ev.orgA.id)),
      );
    messages.add(await notFound(expired.token));
    const list = await call("GET", orgUrl(ev.orgA.id, "/invites"), cookies.owner);
    const { invites } = (await list.json()) as { invites: TeamInvite[] };
    expect(invites.find((i) => i.id === expired.invite.id)?.status).toBe("expired");

    const revoked = await inviteTeam(freshEmail("revogado"));
    const del = await call(
      "DELETE",
      orgUrl(ev.orgA.id, `/invites/${revoked.invite.id}`),
      cookies.owner,
    );
    expect(del.status).toBe(200);
    messages.add(await notFound(revoked.token));
    expect(
      (
        await call(
          "POST",
          orgUrl(ev.orgA.id, `/invites/${revoked.invite.id}/resend`),
          cookies.owner,
        )
      ).status,
    ).toBe(404);

    const resent = await inviteTeam(freshEmail("reenvio"));
    const res = await call(
      "POST",
      orgUrl(ev.orgA.id, `/invites/${resent.invite.id}/resend`),
      cookies.owner,
    );
    expect(res.status).toBe(200);
    const newToken = lastToken();
    expect(newToken).not.toBe(resent.token);
    messages.add(await notFound(resent.token));
    expect((await call("GET", `/api/team-invites/${newToken}`, null)).status).toBe(200);

    expect(messages.size).toBe(1);
  });

  it("organização alheia: rotas dão 404 e convite de outra org não se mexe pelo caminho", async () => {
    expect((await call("GET", orgUrl(ev.orgA.id, "/invites"), cookies.stranger)).status).toBe(404);
    expect((await call("GET", orgUrl(ev.orgA.id, "/members"), cookies.host)).status).toBe(404);
    const resB = await call("POST", orgUrl(ev.orgB.id, "/invites"), cookies.stranger, {
      email: freshEmail("org-b"),
    });
    expect(resB.status).toBe(201);
    const { invite: inviteB } = (await resB.json()) as { invite: TeamInvite };
    const tokenB = lastToken();
    expect(
      (await call("DELETE", orgUrl(ev.orgA.id, `/invites/${inviteB.id}`), cookies.owner)).status,
    ).toBe(404);
    expect(
      (await call("POST", orgUrl(ev.orgA.id, `/invites/${inviteB.id}/resend`), cookies.owner))
        .status,
    ).toBe(404);
    // Evento de outra organização pelo caminho da org A → 404.
    expect(
      (
        await call("POST", orgUrl(ev.orgA.id, `/events/${ev.eventB.id}/hosts`), cookies.owner, {
          email: freshEmail("ev-b"),
        })
      ).status,
    ).toBe(404);
    // O token da org B continua válido e aponta só para a org B.
    const prev = (await (await call("GET", `/api/team-invites/${tokenB}`, null)).json()) as {
      organizationName: string;
    };
    expect(prev.organizationName).toContain("Org b");
  });

  it("platform admin convida em qualquer organização", async () => {
    const res = await call("POST", orgUrl(ev.orgB.id, "/invites"), cookies.platformAdmin, {
      email: freshEmail("admin"),
    });
    expect(res.status).toBe(201);
  });
});

describe("anfitriões do evento", () => {
  it("conta existente: exige login com o mesmo e-mail e só entra no evento convidado", async () => {
    // stranger (dono da org B) vira anfitrião do evento A; membro da org A pode convidar.
    const { invite, token } = await inviteHost(ev.users.stranger.email, "member");
    expect(invite).toMatchObject({
      role: "host",
      eventId: ev.eventA.id,
      eventName: ev.eventA.name,
    });
    expect(sent.at(-1)!.subject).toContain(ev.eventA.name);

    const prevAnon = (await (
      await call("GET", `/api/team-invites/${token}`, null)
    ).json()) as TeamInvitePreview;
    expect(prevAnon.accountExists).toBe(true);
    expect(prevAnon.email).toBe(maskEmail(ev.users.stranger.email));
    const prevLogged = (await (
      await call("GET", `/api/team-invites/${token}`, cookies.stranger)
    ).json()) as TeamInvitePreview;
    expect(prevLogged.email).toBe(ev.users.stranger.email);

    expect((await accept(token)).status).toBe(401);
    // Sessão de outro e-mail: 403, e a senha no corpo não cria nada.
    const wrong = await accept(token, { name: "X", password: "senha-forte-123" }, cookies.member);
    expect(wrong.status).toBe(403);
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toContain(
      "outro e-mail",
    );

    const ok = await accept(token, {}, cookies.stranger);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      created: false,
      email: ev.users.stranger.email,
      organizationId: ev.orgA.id,
      eventId: ev.eventA.id,
    });

    const evA = await call("GET", `/api/admin/events/${ev.eventA.id}/dashboard`, cookies.stranger);
    expect(evA.status).toBe(200);
    const draft = await call(
      "GET",
      `/api/admin/events/${ev.draftA.id}/dashboard`,
      cookies.stranger,
    );
    expect(draft.status).toBe(404);
    expect((await call("GET", orgUrl(ev.orgA.id), cookies.stranger)).status).toBe(404);

    const hosts = await call(
      "GET",
      orgUrl(ev.orgA.id, `/events/${ev.eventA.id}/hosts`),
      cookies.owner,
    );
    const body = (await hosts.json()) as { hosts: { userId: string }[] };
    expect(body.hosts.map((h) => h.userId)).toContain(ev.users.stranger.id);

    // Remover tira só o vínculo; a conta continua.
    const del = await call(
      "DELETE",
      orgUrl(ev.orgA.id, `/events/${ev.eventA.id}/hosts/${ev.users.stranger.id}`),
      cookies.member,
    );
    expect(del.status).toBe(200);
    expect(
      (await call("GET", `/api/admin/events/${ev.eventA.id}/dashboard`, cookies.stranger)).status,
    ).toBe(404);
    expect((await db.select().from(user).where(eq(user.id, ev.users.stranger.id))).length).toBe(1);
    expect(
      (
        await call(
          "DELETE",
          orgUrl(ev.orgA.id, `/events/${ev.eventA.id}/hosts/${ev.users.stranger.id}`),
          cookies.owner,
        )
      ).status,
    ).toBe(404);
  });

  it("anfitrião novo cria a conta e entra só no evento dele", async () => {
    const email = freshEmail("anfitriao");
    const { token } = await inviteHost(email);
    const res = await accept(token, { name: "Anfitriã", password: "senha-forte-123" });
    expect(res.status).toBe(201);
    const [u] = await db.select().from(user).where(eq(user.email, email));
    const links = await db.select().from(eventMembers).where(eq(eventMembers.userId, u!.id));
    expect(links.map((l) => l.eventId)).toEqual([ev.eventA.id]);
    const orgs = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, u!.id));
    expect(orgs).toHaveLength(0);
  });

  it("já anfitrião ou já da equipe: 409", async () => {
    expect(
      (
        await call("POST", orgUrl(ev.orgA.id, `/events/${ev.eventA.id}/hosts`), cookies.owner, {
          email: ev.users.host.email,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("POST", orgUrl(ev.orgA.id, `/events/${ev.eventA.id}/hosts`), cookies.owner, {
          email: ev.users.member.email,
        })
      ).status,
    ).toBe(409);
  });

  it("membro cancela convite de anfitrião, mas não o da equipe (403)", async () => {
    const host = await inviteHost(freshEmail("cancela-host"));
    const team = await inviteTeam(freshEmail("cancela-equipe"));
    expect(
      (await call("DELETE", orgUrl(ev.orgA.id, `/invites/${team.invite.id}`), cookies.member))
        .status,
    ).toBe(403);
    expect(
      (await call("POST", orgUrl(ev.orgA.id, `/invites/${team.invite.id}/resend`), cookies.member))
        .status,
    ).toBe(403);
    expect(
      (await call("DELETE", orgUrl(ev.orgA.id, `/invites/${host.invite.id}`), cookies.member))
        .status,
    ).toBe(200);
  });
});

describe("equipe da organização", () => {
  it("lista, muda papel e nunca deixa a organização sem dono", async () => {
    const list = await call("GET", orgUrl(ev.orgA.id, "/members"), cookies.member);
    expect(list.status).toBe(200);
    const { members } = (await list.json()) as { members: { userId: string; role: string }[] };
    // Dono e membro da fixture (mais quem aceitou convite nos testes acima); nunca a org B.
    expect(members.filter((m) => m.role === "owner").map((m) => m.userId)).toEqual([
      ev.users.owner.id,
    ]);
    expect(members.map((m) => m.userId)).toContain(ev.users.member.id);
    expect(members.map((m) => m.userId)).not.toContain(ev.users.stranger.id);

    const ownerUrl = orgUrl(ev.orgA.id, `/members/${ev.users.owner.id}`);
    const memberUrl = orgUrl(ev.orgA.id, `/members/${ev.users.member.id}`);
    expect((await call("PATCH", memberUrl, cookies.member, { role: "owner" })).status).toBe(403);
    expect((await call("DELETE", memberUrl, cookies.member)).status).toBe(403);
    expect((await call("PATCH", ownerUrl, cookies.owner, { role: "member" })).status).toBe(422);
    expect((await call("DELETE", ownerUrl, cookies.owner)).status).toBe(422);
    expect((await call("PATCH", ownerUrl, cookies.owner, { role: "chefe" })).status).toBe(422);
    expect(
      (
        await call("PATCH", orgUrl(ev.orgA.id, "/members/inexistente"), cookies.owner, {
          role: "member",
        })
      ).status,
    ).toBe(404);
    // Pessoa da org B pelo caminho da org A: não existe aqui.
    expect(
      (await call("DELETE", orgUrl(ev.orgA.id, `/members/${ev.users.stranger.id}`), cookies.owner))
        .status,
    ).toBe(404);

    // Com dois donos, um pode deixar de ser dono.
    expect((await call("PATCH", memberUrl, cookies.owner, { role: "owner" })).status).toBe(200);
    expect((await call("PATCH", ownerUrl, cookies.member, { role: "member" })).status).toBe(200);
    expect((await call("PATCH", memberUrl, cookies.member, { role: "member" })).status).toBe(422);
    // Volta ao estado da fixture.
    expect((await call("PATCH", ownerUrl, cookies.member, { role: "owner" })).status).toBe(200);
    expect((await call("PATCH", memberUrl, cookies.owner, { role: "member" })).status).toBe(200);
  });

  it("remover da equipe tira o acesso na hora, sem apagar a conta", async () => {
    const email = freshEmail("removida");
    const { token } = await inviteTeam(email);
    expect((await accept(token, { name: "Removida", password: "senha-forte-123" })).status).toBe(
      201,
    );
    const login = await signIn(email, "senha-forte-123");
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect((await call("GET", orgUrl(ev.orgA.id), cookie)).status).toBe(200);
    const [u] = await db.select().from(user).where(eq(user.email, email));
    expect(
      (await call("DELETE", orgUrl(ev.orgA.id, `/members/${u!.id}`), cookies.owner)).status,
    ).toBe(200);
    expect((await call("GET", orgUrl(ev.orgA.id), cookie)).status).toBe(404);
    expect((await db.select().from(user).where(eq(user.id, u!.id))).length).toBe(1);
  });
});

describe("aceite: proteções", () => {
  it("recusa escrita de outra origem (CSRF)", async () => {
    const { token } = await inviteTeam(freshEmail("csrf"));
    const res = await app.request(`/api/team-invites/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://malicioso.exemplo" },
      body: JSON.stringify({ name: "X", password: "senha-forte-123" }),
    });
    expect(res.status).toBe(403);
  });

  it("limita tentativas de aceite por IP", async () => {
    const ip = "192.0.2.77";
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.request(`/api/team-invites/${"b".repeat(43)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
        body: "{}",
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
