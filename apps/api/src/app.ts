import { eq, settings, type Database } from "@casamento/db";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Auth } from "./auth.ts";
import type { Env } from "./env.ts";
import { webKey } from "./middleware/web-key.ts";
import { painelRoutes } from "./painel.ts";

export interface AppDeps {
  env: Env;
  db: Database;
  auth: Auth;
  /** Pasta do build do painel (padrão: dist/painel). */
  painelDist?: string;
}

/** Monta a aplicação sem abrir porta: o servidor fica em server.ts e os testes usam app.request(). */
export function createApp({ env, db, auth, painelDist }: AppDeps) {
  const app = new Hono();

  app.use("*", secureHeaders());
  app.use("/api/*", webKey(env.WEB_KEY));

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.get("/api/site", async (c) => {
    const rows = await db.select().from(settings).where(eq(settings.isPublic, true));
    const data: Record<string, unknown> = {};
    for (const row of rows) data[row.key] = row.value;
    return c.json({ settings: data });
  });

  app.route("/", painelRoutes(painelDist));

  app.notFound((c) =>
    c.json({ error: "not_found", message: `Rota ${c.req.method} ${c.req.path} não existe.` }, 404),
  );

  app.onError((err, c) => {
    console.error(err);
    return c.json(
      {
        error: "internal_error",
        message: "Erro interno na API. Veja o log do servidor para os detalhes.",
      },
      500,
    );
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
