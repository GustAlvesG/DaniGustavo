import { Hono } from "hono";
import type { AdminDeps } from "../admin/context.ts";
import { notYet } from "../admin/stub.ts";

/*
 * Fase 7, frente A (docs/saas/fase-7.md): API da portaria, sem conta, em /api/checkin.
 * Isenta de X-Web-Key (web-key.ts): quem chama é o navegador da portaria, sem cookie; a
 * credencial vai em `Authorization: Bearer <sessão>`, então não há CSRF a temer.
 *
 * - POST /session            CheckinSessionInput → CheckinSessionResult. Link achado pelo
 *   SHA-256 do token dentro de `crossEvent`; PIN conferido por scrypt em tempo constante; rate
 *   limit por IP e por link; CHECKIN_PIN_MAX_FAILURES erros bloqueiam o link por
 *   CHECKIN_PIN_LOCK_MINUTES. Mesma resposta 401 para token inválido, expirado, revogado e PIN
 *   errado. Sessão = HMAC (linkId, expiração) com BETTER_AUTH_SECRET; cada requisição confere
 *   no banco que o link segue ativo (revogar derruba na hora).
 * - GET  /summary            → CheckinTotals (polling)
 * - GET  /lookup?code=|?q=   → CheckinLookupResult (sem contato nem dado de saúde)
 * - POST /arrivals           CheckinArrivalInput → CheckinArrivalResult
 * - POST /arrivals/:arrivalId/undo → CheckinArrivalResult (só marcações deste evento)
 */
export function checkinRoutes(deps: AdminDeps) {
  void deps;
  const app = new Hono();
  const soon = "Portaria";
  app.post("/session", (c) => notYet(c, soon));
  app.get("/summary", (c) => notYet(c, soon));
  app.get("/lookup", (c) => notYet(c, soon));
  app.post("/arrivals", (c) => notYet(c, soon));
  app.post("/arrivals/:arrivalId{[0-9]+}/undo", (c) => notYet(c, soon));
  return app;
}
