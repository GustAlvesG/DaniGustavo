import { z } from "zod";

const url = (exemplo: string) =>
  z.url({ error: `deve ser uma URL completa, por exemplo ${exemplo}` });

const secret = (nome: string) =>
  z
    .string({ error: "não foi definida" })
    .min(32, { error: `deve ter pelo menos 32 caracteres (gere um ${nome} aleatório)` });

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string({ error: "não foi definida" }).regex(/^mysql:\/\//, {
    error: "deve começar com mysql://, ex.: mysql://root:@127.0.0.1:3306/casamento",
  }),
  API_URL: url("http://localhost:3333"),
  WEB_KEY: secret("segredo"),
  BETTER_AUTH_SECRET: secret("segredo"),
  BETTER_AUTH_URL: url("http://localhost:3333"),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(issues: string[]) {
    super(
      [
        "Configuração inválida da API. Corrija o .env na raiz do projeto (veja .env.example):",
        ...issues.map((i) => `  - ${i}`),
      ].join("\n"),
    );
    this.name = "EnvError";
  }
}

/** Valida as variáveis de ambiente. Lança `EnvError` com mensagem em pt-BR se algo faltar. */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  // Variáveis vazias no .env contam como não definidas.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => {
        const key = issue.path.join(".");
        const message = cleaned[key] === undefined ? "não foi definida" : issue.message;
        return `${key}: ${message}`;
      }),
    );
  }
  return result.data;
}
