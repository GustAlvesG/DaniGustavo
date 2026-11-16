import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "./helpers.ts";

// Usa o banco de DATABASE_URL já migrado e com seed (no CI: pnpm db:migrate && pnpm db:seed).
const { app, db } = testApp();

afterAll(async () => {
  await db.$client.end();
});

describe("GET /api/site", () => {
  it("devolve as configurações públicas já em JSON", async () => {
    const res = await app.request("/api/site");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: Record<string, unknown> };
    expect(body.settings["wedding.datetime"]).toBe("2027-05-15T16:00:00-03:00");
    expect(body.settings["ceremony.venue"]).toMatchObject({ name: "Local a definir" });
  });
});

describe("Better Auth", () => {
  it("não aceita cadastro público", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Intruso",
        email: "intruso@exemplo.com",
        password: "uma-senha-qualquer-123",
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("recusa senha errada", async () => {
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL_1 ?? "dani@exemplo.com",
        password: "senha-errada-123",
      }),
    });
    expect(res.status).toBe(401);
  });

  it.runIf(process.env.ADMIN_EMAIL_1 && process.env.ADMIN_PASSWORD_INICIAL)(
    "faz login com um admin do seed",
    async () => {
      const res = await app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: process.env.ADMIN_EMAIL_1,
          password: process.env.ADMIN_PASSWORD_INICIAL,
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { twoFactorRedirect?: boolean; user?: unknown };
      // Sem 2FA: devolve o usuário e o cookie de sessão. Com 2FA: pede o código.
      expect(body.twoFactorRedirect === true || body.user !== undefined).toBe(true);
      expect(res.headers.get("set-cookie")).toBeTruthy();
    },
  );
});
