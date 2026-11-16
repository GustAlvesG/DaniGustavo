import { serve } from "@hono/node-server";
import { getDb, loadRootEnv } from "@casamento/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { EnvError, parseEnv } from "./env.ts";

loadRootEnv();

let env;
try {
  env = parseEnv();
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const db = getDb();
const app = createApp({ env, db, auth: createAuth(env, db) });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API em http://localhost:${info.port} (painel em /painel)`);
});

const shutdown = () => {
  server.close();
  void db.$client.end();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
