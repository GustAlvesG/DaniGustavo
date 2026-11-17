import { serve } from "@hono/node-server";
import { getDb, loadRootEnv } from "@casamento/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { EnvError, parseEnv } from "./env.ts";
import { startExpiryJob, startReconcileJob, startReminderJob } from "./jobs.ts";
import { createMailer } from "./mailer.ts";
import { createPaymentProvider } from "./payments/index.ts";

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
const provider = createPaymentProvider(env);
const mailer = createMailer(env);
const app = createApp({ env, db, auth: createAuth(env, db), provider, mailer });
const jobDeps = { env, db, provider, mailer, now: () => new Date() };
const stopExpiryJob = startExpiryJob(jobDeps);
const stopReconcileJob = startReconcileJob(jobDeps);
const stopReminderJob = startReminderJob(jobDeps);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API em http://localhost:${info.port} (painel em /painel)`);
  console.log(`Pagamentos: provedor "${provider.name}".`);
});

const shutdown = () => {
  stopExpiryJob();
  stopReconcileJob();
  stopReminderJob();
  server.close();
  void db.$client.end();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
