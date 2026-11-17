import { desc, eq, messages, type Database } from "@casamento/db";
import { CreateMessageRequest, ERROR_CODES, type WallResponse } from "@casamento/shared";
import { Hono } from "hono";
import { apiError } from "../errors.ts";
import type { RateLimiter } from "../rate-limit.ts";
import { clientIp } from "./invitations.ts";

const MINUTE = 60_000;
/** Recados novos por IP: 3 a cada 10 minutos (o mural é de família e amigos, não de chat). */
export const MESSAGE_LIMIT = 3;
export const MESSAGE_WINDOW_MS = 10 * MINUTE;
/** Quantos recados aprovados o mural devolve (os mais recentes). */
export const WALL_LIMIT = 200;

export interface MessageDeps {
  db: Database;
  limiter: RateLimiter;
}

/** Tira caracteres de controle (menos quebra de linha) e limita linhas em branco seguidas. */
export function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * /api/messages
 * - GET: só recados aprovados (autor, texto e data; nunca e-mail, IP ou dados do pedido).
 * - POST: "Deixe um recado" sem presente; entra como pendente e só aparece depois que os
 *   noivos aprovam no painel. Honeypot + limite por IP; o IP não é guardado.
 */
export function messageRoutes({ db, limiter }: MessageDeps) {
  const app = new Hono();

  app.get("/", async (c) => {
    const rows = await db
      .select({ author: messages.author, body: messages.body, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.approved, true))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(WALL_LIMIT);
    const body: WallResponse = {
      messages: rows.map((r) => ({
        author: r.author,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
      })),
    };
    c.header("Cache-Control", "public, max-age=15");
    return c.json(body);
  });

  app.post("/", async (c) => {
    c.header("Cache-Control", "no-store");
    const limit = limiter.hit(`messages:${clientIp(c)}`, MESSAGE_LIMIT, MESSAGE_WINDOW_MS);
    if (!limit.allowed) {
      return apiError(
        c,
        429,
        ERROR_CODES.tooManyRequests,
        `Você já deixou alguns recados agora há pouco. Aguarde uns ${Math.ceil(limit.retryAfter / 60)} minutos para escrever outro.`,
        { "Retry-After": String(limit.retryAfter) },
      );
    }
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      raw = undefined;
    }
    const trap = (raw as { website?: unknown } | undefined)?.website;
    if (typeof trap === "string" && trap.trim() !== "") {
      // Honeypot: o robô recebe "sucesso" e nada é gravado (não dá pista para contornar).
      return c.json({ ok: true }, 201);
    }
    const parsed = CreateMessageRequest.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        c,
        422,
        ERROR_CODES.invalidRequest,
        parsed.error.issues[0]?.message ?? "Recado inválido.",
      );
    }
    const author = cleanText(parsed.data.author).replace(/\s+/g, " ");
    const body = cleanText(parsed.data.body);
    if (author.length < 2 || body.length < 2) {
      return apiError(c, 422, ERROR_CODES.invalidRequest, "Escreva o seu nome e o seu recado.");
    }
    await db.insert(messages).values({ author, body, approved: false });
    return c.json({ ok: true }, 201);
  });

  return app;
}
