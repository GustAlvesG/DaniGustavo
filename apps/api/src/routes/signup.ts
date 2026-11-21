import { Hono } from "hono";
import type { AdminDeps } from "../admin/context.ts";
import { notYet } from "../admin/stub.ts";

/*
 * Fase 6, frente B (docs/saas/fase-6.md): cadastro self-service, em /api/signup. Fechado com
 * `SIGNUP_ENABLED=0` (404 de rota em todas). Cadastro público do Better Auth continua desligado:
 * a conta é criada aqui, como no aceite de convite (user + account com hash do Better Auth).
 *
 * - POST /                 SignupInput → 202 (sempre a mesma resposta; honeypot `website`;
 *   rate limit por IP e por e-mail; e-mail com o link `#/cadastro/<token>` do painel). Vem do
 *   site (Server Action com X-Web-Key).
 * - GET  /:token           → SignupPreview (404 se expirado/usado)
 * - POST /:token/confirm   SignupConfirmInput → SignupConfirmResult (cria user com e-mail
 *   verificado, account, organização (dono), assinatura no plano escolhido com teste, aceite dos
 *   termos em legal_acceptances; e-mail que já tem conta → 409 pedindo login). Chamado pelo
 *   painel: `/api/signup/` está nas isenções do X-Web-Key (como /api/team-invites/).
 */
export function signupRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono();
  const soon = "Cadastro";
  app.post("/", (c) => notYet(c, soon));
  app.get("/:token", (c) => notYet(c, soon));
  app.post("/:token/confirm", (c) => notYet(c, soon));
  return app;
}
