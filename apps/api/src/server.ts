import { serve } from "@hono/node-server";
import { getDb, loadRootEnv } from "@casamento/db";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { EnvError, parseEnv } from "./env.ts";
import { createWebRevalidator } from "./admin/revalidate.ts";
import {
  startAccountStatusJob,
  startExpiryJob,
  startReconcileJob,
  startReminderJob,
} from "./jobs.ts";
import { createMailer } from "./mailer.ts";
import { createPaymentProvider } from "./payments/index.ts";
import { secretBoxFromEnv } from "./crypto/secret-box.ts";
import { startSubscriptionJob } from "./plans/jobs.ts";
import { startRetentionJob } from "./privacy/retention.ts";
import { startTaskReminderJob } from "./tasks/reminder-job.ts";
import { createLocalStorage } from "./storage/index.ts";
import { createAlerter } from "./alerts.ts";
import { describeError, loggerFromEnv } from "./log.ts";

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
const secrets = secretBoxFromEnv(env);
// Fase 6: logs JSON em produção (LOG_FORMAT muda) e alertas por e-mail (PLATFORM_ALERT_EMAIL).
const logger = loggerFromEnv(env);
const alerts = createAlerter({ env, mailer, logger });
const app = createApp({
  env,
  db,
  auth: createAuth(env, db),
  provider,
  mailer,
  secrets,
  logger,
  alerts,
});

// Erro que escapou de tudo (promessa sem catch): log e alerta, sem derrubar o processo.
process.on("unhandledRejection", (reason) => {
  logger.error("promessa rejeitada sem tratamento", describeError(reason));
  void alerts.notify({
    key: "processo:unhandledRejection",
    title: "Promessa rejeitada sem tratamento na API",
    error: reason,
  });
});

const jobDeps = {
  logger,
  alerts,
  env,
  db,
  provider,
  mailer,
  secrets,
  now: () => new Date(),
  revalidate: createWebRevalidator(env),
};
const stopExpiryJob = startExpiryJob(jobDeps);
const stopReconcileJob = startReconcileJob(jobDeps);
const stopReminderJob = startReminderJob(jobDeps);
const stopAccountStatusJob = startAccountStatusJob(jobDeps);
// Fase 6 (docs/saas/fase-6.md): A = assinaturas e uso; C = retenção (LGPD); E = resumo de tarefas.
const stopSubscriptionJob = startSubscriptionJob(jobDeps);
const stopRetentionJob = startRetentionJob({
  ...jobDeps,
  storage: createLocalStorage(env.UPLOAD_DIR),
});
const stopTaskReminderJob = startTaskReminderJob(jobDeps);

if (env.PAYMENT_PROVIDER === "asaas" && !env.ASAAS_PLATFORM_WALLET_ID) {
  logger.warn(
    "[pagamentos] ASAAS_PLATFORM_WALLET_ID vazio: eventos que recebem em subconta com taxa da plataforma ficam sem presentes em dinheiro.",
  );
}

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`API em http://localhost:${info.port} (painel em /painel)`, { port: info.port });
  logger.info(`Pagamentos: provedor "${provider.name}".`, { provider: provider.name });
});

const shutdown = () => {
  stopExpiryJob();
  stopReconcileJob();
  stopReminderJob();
  stopAccountStatusJob();
  stopSubscriptionJob();
  stopRetentionJob();
  stopTaskReminderJob();
  server.close();
  void db.$client.end();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
