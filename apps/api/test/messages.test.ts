import { eq, inArray, LEGACY_EVENT_ID, messages } from "@casamento/db";
import { ApiError, WallResponse } from "@casamento/shared";
import { afterAll, describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/rate-limit.ts";
import { cleanText, MESSAGE_LIMIT } from "../src/routes/messages.ts";
import { TEST_WEB_KEY, testApp } from "./helpers.ts";

// Usa o banco de testes da API. Os recados do teste levam um sufixo único no
// autor e são apagados no fim; os recados reais do banco não são tocados.

const run = Date.now().toString(36);
const { app, db } = testApp({ rateLimiter: createRateLimiter() });
let n = 0;
const ip = () => `10.7.${n++}.${run.length}`;
const authors = [`Ana ${run}`, `Bot ${run}`, `Zé ${run}`, `Pendente ${run}`];

const post = (body: unknown, clientIp = ip()) =>
  app.request("/api/e/dani-gustavo/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Web-Key": TEST_WEB_KEY,
      "X-Client-Ip": clientIp,
    },
    body: JSON.stringify(body),
  });

afterAll(async () => {
  await db.delete(messages).where(inArray(messages.author, authors));
  await db.$client.end();
});

describe("GET /api/messages", () => {
  it("mostra só os aprovados, sem dado pessoal", async () => {
    await db.insert(messages).values({
      eventId: LEGACY_EVENT_ID,
      author: `Ana ${run}`,
      body: "Parabéns aos dois!",
      approved: true,
    });
    await db.insert(messages).values({
      eventId: LEGACY_EVENT_ID,
      author: `Pendente ${run}`,
      body: "Ainda não aprovado",
      approved: false,
    });

    const res = await app.request("/api/e/dani-gustavo/messages");
    expect(res.status).toBe(200);
    const body = WallResponse.parse(await res.json());
    expect(body.messages.find((m) => m.author === `Ana ${run}`)?.body).toBe("Parabéns aos dois!");
    expect(body.messages.some((m) => m.author === `Pendente ${run}`)).toBe(false);
    // Só autor, texto e data: nenhum outro campo (e-mail, id, pedido).
    for (const m of body.messages) {
      expect(Object.keys(m).sort()).toEqual(["author", "body", "createdAt"]);
    }
  });

  it("um recado ocultado some do mural", async () => {
    await db
      .update(messages)
      .set({ approved: false })
      .where(eq(messages.author, `Ana ${run}`));
    const body = WallResponse.parse(
      await (await app.request("/api/e/dani-gustavo/messages")).json(),
    );
    expect(body.messages.some((m) => m.author === `Ana ${run}`)).toBe(false);
  });
});

describe("POST /api/messages", () => {
  it("entra como pendente e não aparece no mural", async () => {
    const res = await post({ author: `Zé ${run}`, body: "Muita felicidade!" });
    expect(res.status).toBe(201);
    const [row] = await db
      .select()
      .from(messages)
      .where(eq(messages.author, `Zé ${run}`));
    expect(row?.approved).toBe(false);
    expect(row?.giftOrderId).toBeNull();
    const wall = WallResponse.parse(
      await (await app.request("/api/e/dani-gustavo/messages")).json(),
    );
    expect(wall.messages.some((m) => m.author === `Zé ${run}`)).toBe(false);
  });

  it("honeypot: responde sucesso mas não grava nada", async () => {
    const res = await post({ author: `Bot ${run}`, body: "compre agora", website: "http://spam" });
    expect(res.status).toBe(201);
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.author, `Bot ${run}`));
    expect(rows).toHaveLength(0);
  });

  it("valida tamanho e nome", async () => {
    for (const body of [
      { author: "A", body: "oi, tudo bem" },
      { author: "Fulano", body: "" },
      { author: "Fulano", body: "x".repeat(501) },
      { author: "x".repeat(81), body: "oi" },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(422);
      ApiError.parse(await res.json());
    }
  });

  it("exige a X-Web-Key (como toda escrita em /api)", async () => {
    const res = await app.request("/api/e/dani-gustavo/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: "Fulano", body: "oi" }),
    });
    expect(res.status).toBe(401);
  });

  it("limita por IP e devolve Retry-After", async () => {
    const same = `10.9.9.${run.length}`;
    for (let i = 0; i < MESSAGE_LIMIT; i++) {
      // Honeypot: conta no limite sem sujar o banco.
      expect((await post({ author: "Fulano", body: "oi", website: "x" }, same)).status).toBe(201);
    }
    const res = await post({ author: "Fulano", body: "oi", website: "x" }, same);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("cleanText", () => {
  it("tira controles e limita linhas em branco", () => {
    expect(cleanText("a\u0000b\n\n\n\nc ")).toBe("ab\n\nc");
  });
});
