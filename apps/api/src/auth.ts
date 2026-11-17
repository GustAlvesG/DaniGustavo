import { account, session, user, verification, type Database } from "@casamento/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { ulid } from "ulid";
import type { Env } from "./env.ts";

export function createAuth(env: Env, db: Database) {
  return betterAuth({
    appName: "Painel Dani & Gustavo",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, {
      provider: "mysql",
      schema: { user, session, account, verification },
    }),
    // Só os dois usuários criados pelo seed: cadastro público desligado.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    // Login só com e-mail e senha (sem 2FA, decisão do casal). O limite vale em todos os
    // ambientes (o padrão do Better Auth é só em produção): 5 tentativas por minuto por IP no
    // login e na troca de senha.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: () => ulid() },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
