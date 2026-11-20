import { AcceptTeamInvite } from "@casamento/shared";
import { Hono, type Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { invalid, readJson, sameOrigin, type AdminDeps, type AdminEnv } from "../admin/context.ts";
import { apiError, ERROR_CODES } from "../errors.ts";
import { handleInviteErrors } from "../team-invites/http.ts";
import { acceptInvite, INVITE_NOT_FOUND, previewInvite } from "../team-invites/service.ts";

/*
 * Fase 3, frente B (docs/saas/fase-3.md): aceite de convite da equipe/anfitrião, sem sessão
 * obrigatória (o painel chama de #/aceitar/<token>). Isento de X-Web-Key (web-key.ts): usa
 * `sameOrigin` no POST e limite por IP.
 *
 * - GET  /api/team-invites/:token        → TeamInvitePreview (404 se inválido, expirado, usado
 *                                          ou revogado — a mesma mensagem para todos)
 * - POST /api/team-invites/:token/accept → AcceptTeamInvite → AcceptTeamInviteResult
 *   Sem conta: cria user + account "credential" e vincula (o painel faz login em seguida).
 *   Com conta: exige sessão com o mesmo e-mail e só vincula.
 */

const MINUTE = 60_000;
/** Consultas do convite por IP por minuto (adivinhar token é inviável; isto corta varredura). */
export const TEAM_INVITE_PREVIEW_LIMIT = 30;
/** Tentativas de aceite por IP a cada 10 minutos. */
export const TEAM_INVITE_ACCEPT_LIMIT = 10;

/**
 * IP do visitante. Em produção o edge (Caddy) sobrescreve X-Real-IP/X-Forwarded-For com o IP
 * real (snippet `ip_real`), então confiar neles é seguro; sem eles, o endereço do socket.
 */
function visitorIp(c: Context): string {
  const real = c.req.header("x-real-ip")?.trim();
  if (real) return real.slice(0, 45);
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 45);
  try {
    return getConnInfo(c).remote.address ?? "desconhecido";
  } catch {
    return "desconhecido";
  }
}

export function teamInviteRoutes(deps: AdminDeps) {
  const { db, auth, limiter } = deps;
  const app = new Hono<AdminEnv>();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    // O token na URL não deve vazar para outros sites por Referer.
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });
  app.use("*", sameOrigin([new URL(deps.env.BETTER_AUTH_URL).origin]));

  const limited = (c: Context, bucket: string, max: number, windowMs: number) => {
    const r = limiter.hit(`team-invite:${bucket}:${visitorIp(c)}`, max, windowMs);
    if (r.allowed) return null;
    return apiError(
      c,
      429,
      ERROR_CODES.tooManyRequests,
      `Muitas tentativas seguidas. Aguarde ${r.retryAfter} segundos e tente de novo.`,
      { "Retry-After": String(r.retryAfter) },
    );
  };

  const sessionOf = async (c: Context) => {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    return s ? { userId: s.user.id, email: s.user.email } : null;
  };

  app.get("/:token", async (c) => {
    const blocked = limited(c, "preview", TEAM_INVITE_PREVIEW_LIMIT, MINUTE);
    if (blocked) return blocked;
    const session = await sessionOf(c);
    const preview = await previewInvite(
      db,
      c.req.param("token"),
      deps.now(),
      session?.email ?? null,
    );
    if (!preview) return apiError(c, 404, ERROR_CODES.notFound, INVITE_NOT_FOUND);
    return c.json(preview);
  });

  app.post("/:token/accept", async (c) => {
    const blocked = limited(c, "accept", TEAM_INVITE_ACCEPT_LIMIT, 10 * MINUTE);
    if (blocked) return blocked;
    const parsed = AcceptTeamInvite.safeParse((await readJson(c)) ?? {});
    if (!parsed.success) return invalid(c, parsed.error.issues);
    return handleInviteErrors(c, async () => {
      const result = await acceptInvite(
        db,
        c.req.param("token"),
        parsed.data,
        await sessionOf(c),
        deps.now(),
      );
      return c.json(result, result.created ? 201 : 200);
    });
  });
  return app;
}
