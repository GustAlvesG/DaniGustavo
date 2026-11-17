import { SiteContent } from "@casamento/shared";
import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "./helpers.ts";

// Usa o banco de DATABASE_URL já migrado e com seed (no CI: pnpm db:migrate && pnpm db:seed).
const { app, db } = testApp();

afterAll(async () => {
  await db.$client.end();
});

describe("GET /api/site", () => {
  it("devolve o conteúdo completo no formato SiteContent", async () => {
    const res = await app.request("/api/site");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const body = SiteContent.parse(await res.json());
    expect(body.wedding.datetime).toBe("2027-04-10T16:00:00-03:00");
    expect(body.couple.monogram).toBe("DG");
    expect(body.ceremony).toMatchObject({
      name: "Solare Roma",
      mapsUrl:
        "https://www.google.com/maps/search/?api=1&query=R.%20Papagaio%2C%201800%20-%20Roma%2C%20Volta%20Redonda%20-%20RJ%2C%2027257-770",
      wazeUrl:
        "https://waze.com/ul?q=R.%20Papagaio%2C%201800%20-%20Roma%2C%20Volta%20Redonda%20-%20RJ%2C%2027257-770&navigate=yes",
    });
    expect(body.godparents.missions).toHaveLength(6);
    expect(body.story).toHaveLength(5);
    expect(body.gallery.items).toHaveLength(8);
    expect(body.faq.length).toBeGreaterThanOrEqual(6);
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

  it("limita o login a 5 tentativas por minuto por IP", async () => {
    const attempt = () =>
      app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.77" },
        body: JSON.stringify({ email: "ninguem@exemplo.com", password: "senha-errada-123" }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
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
      const body = (await res.json()) as { user?: unknown };
      // Sem 2FA: e-mail e senha bastam; devolve o usuário e o cookie de sessão.
      expect(body.user).toBeDefined();
      expect(res.headers.get("set-cookie")).toBeTruthy();
    },
  );
});
