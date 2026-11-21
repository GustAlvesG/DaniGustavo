import {
  eq,
  legalAcceptances,
  newPublicId,
  organizationMembers,
  paymentAccounts,
  session,
  user,
} from "@casamento/db";
import type { ApiError, MyDataExport } from "@casamento/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEvents, testApp, type TestEvents, type TestUserKind } from "./helpers.ts";

// Fase 6, frente C: exportar e apagar a própria conta (/api/admin/me).

const { app, db } = testApp();
let t!: TestEvents;
const cookies = {} as Record<TestUserKind, string>;

const run = (kind: TestUserKind, path: string, method = "GET", body?: unknown) =>
  app.request(`/api/admin/me${path}`, {
    method,
    headers: { cookie: cookies[kind], "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const remove = (kind: TestUserKind, email: string) =>
  run(kind, "", "DELETE", { confirmEmail: email });

beforeAll(async () => {
  t = await createTestEvents(db);
  for (const kind of ["host", "owner", "member", "stranger"] as const) {
    cookies[kind] = await t.login(app, kind);
  }
  await db.insert(legalAcceptances).values({
    userId: t.users.owner.id,
    document: "terms",
    version: "2026-11",
    acceptedAt: new Date("2026-11-01T12:00:00Z"),
    ipHash: "a".repeat(64),
  });
});

afterAll(async () => {
  await t.cleanup();
  await db.$client.end();
});

describe("GET /api/admin/me/export", () => {
  it("devolve só os dados da própria pessoa, sem segredos", async () => {
    const res = await run("owner", "/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("meus-dados.json");
    const text = await res.text();
    const data = JSON.parse(text) as MyDataExport;
    expect(data.user).toMatchObject({ id: t.users.owner.id, email: t.users.owner.email });
    expect(data.organizations).toEqual([{ id: t.orgA.id, name: `Org a ${t.run}`, role: "dono" }]);
    expect(data.events).toEqual([]);
    expect(data.legalAcceptances).toEqual([
      { document: "terms", version: "2026-11", acceptedAt: "2026-11-01T12:00:00.000Z" },
    ]);
    expect(text).not.toContain("password");
    expect(text).not.toContain("a".repeat(64));
    expect(text).not.toContain(t.orgB.slug);
  });

  it("anfitrião vê o evento em que está", async () => {
    const data = (await (await run("host", "/export")).json()) as MyDataExport;
    expect(data.events).toEqual([{ id: t.eventA.id, name: t.eventA.name, role: "anfitrião" }]);
  });

  it("sem sessão → 401", async () => {
    expect((await app.request("/api/admin/me/export")).status).toBe(401);
  });
});

describe("DELETE /api/admin/me", () => {
  it("único dono de organização com evento → 409", async () => {
    const res = await remove("owner", t.users.owner.email);
    expect(res.status).toBe(409);
    expect(((await res.json()) as ApiError).error.message).toContain("único dono");
    const res2 = await remove("stranger", t.users.stranger.email);
    expect(res2.status).toBe(409);
  });

  it("e-mail de confirmação diferente → 422", async () => {
    const res = await remove("member", "outra@exemplo.com");
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiError).error.field).toBe("confirmEmail");
  });

  it("titular de conta de recebimento → 409", async () => {
    await db.insert(paymentAccounts).values({
      organizationId: t.orgA.id,
      holder: "user",
      userId: t.users.host.id,
      provider: "simulado",
      publicId: newPublicId(),
      personType: "individual",
      name: "Anfitrião",
      email: t.users.host.email,
      documentHint: "•••.•••.789-09",
    });
    const res = await remove("host", t.users.host.email);
    expect(res.status).toBe(409);
    expect(((await res.json()) as ApiError).error.message).toContain("conta de recebimento");
  });

  it("apaga usuário, sessões e vínculos; a sessão para de valer", async () => {
    const res = await remove("member", t.users.member.email.toUpperCase());
    expect(res.status).toBe(200);
    expect(await db.select().from(user).where(eq(user.id, t.users.member.id))).toEqual([]);
    expect(await db.select().from(session).where(eq(session.userId, t.users.member.id))).toEqual(
      [],
    );
    expect(
      await db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, t.users.member.id)),
    ).toEqual([]);
    expect((await run("member", "/export")).status).toBe(401);
  });

  it("com outro dono na organização, o dono pode sair", async () => {
    await db
      .insert(organizationMembers)
      .values({ organizationId: t.orgA.id, userId: t.users.platformAdmin.id, role: "owner" });
    const res = await remove("owner", t.users.owner.email);
    expect(res.status).toBe(200);
    expect(await db.select().from(user).where(eq(user.id, t.users.owner.id))).toEqual([]);
  });
});
