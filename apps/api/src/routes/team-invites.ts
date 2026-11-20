import { Hono } from "hono";
import type { AdminDeps } from "../admin/context.ts";
import { notYet } from "../admin/org/stub.ts";

/*
 * Fase 3, frente B (docs/saas/fase-3.md): aceite de convite da equipe/anfitrião, sem sessão
 * obrigatória (o painel chama de #/aceitar/<token>). Isento de X-Web-Key (web-key.ts): use
 * `sameOrigin` (admin/context.ts) no POST e limite por IP (deps.limiter).
 *
 * - GET  /api/team-invites/:token        → TeamInvitePreview (404 se inválido, expirado, usado
 *                                          ou revogado — a mesma mensagem para todos)
 * - POST /api/team-invites/:token/accept → AcceptTeamInvite → AcceptTeamInviteResult
 *   Sem conta: cria user + account "credential" (hashPassword, como addUser da CLI) e vincula.
 *   Com conta: exige sessão com o mesmo e-mail (deps.auth.api.getSession) e só vincula.
 * A busca pelo token atravessa organizações: envolva em crossEvent("convite da equipe por token").
 */
export function teamInviteRoutes(deps: AdminDeps) {
  void deps; // a frente usa deps (db, mailer, limiter...)
  const app = new Hono();
  // TODO(fase3-B)
  app.get("/:token", (c) => notYet(c, "Convite"));
  app.post("/:token/accept", (c) => notYet(c, "Aceitar convite"));
  return app;
}
