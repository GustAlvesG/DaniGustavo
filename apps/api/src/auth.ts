import { account, session, twoFactor, user, verification, type Database } from "@casamento/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor as twoFactorPlugin } from "better-auth/plugins";
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
      schema: { user, session, account, verification, twoFactor },
    }),
    // Só os dois usuários criados pelo seed: cadastro público desligado.
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    plugins: [twoFactorPlugin({ issuer: "Casamento D&G" })],
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: () => ulid() },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
