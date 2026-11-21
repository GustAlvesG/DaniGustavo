import type { Database } from "@casamento/db";
import { Hono } from "hono";
import { notYet } from "../admin/stub.ts";
import type { Mailer } from "../mailer.ts";
import type { RateLimiter } from "../rate-limit.ts";
import type { PublicEventEnv } from "../tenancy/types.ts";

/*
 * Fase 6, frente C: POST /api/e/:slug/privacy-requests (público, com X-Web-Key vindo do site):
 * PrivacyRequestInput → 202. Honeypot `website`, 3 por 10 min por IP; avisa a equipe do evento
 * por e-mail. A página `/privacidade` do site mostra o aviso e o formulário.
 */
export function privacyRequestRoutes(deps: { db: Database; limiter: RateLimiter; mailer: Mailer }) {
  void deps;
  const app = new Hono<PublicEventEnv>();
  app.post("/", (c) => notYet(c, "Pedido de privacidade"));
  return app;
}
