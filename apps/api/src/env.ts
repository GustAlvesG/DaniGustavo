import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Pasta padrão das imagens enviadas pelo painel (fora do git). */
export const DEFAULT_UPLOAD_DIR = fileURLToPath(new URL("../storage/uploads", import.meta.url));

const url = (exemplo: string) =>
  z.url({ error: `deve ser uma URL completa, por exemplo ${exemplo}` });

const secret = (nome: string) =>
  z
    .string({ error: "não foi definida" })
    .min(32, { error: `deve ter pelo menos 32 caracteres (gere um ${nome} aleatório)` });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_URL: z.string({ error: "não foi definida" }).regex(/^mysql:\/\//, {
      error: "deve começar com mysql://, ex.: mysql://root:@127.0.0.1:3306/casamento",
    }),
    API_URL: url("http://localhost:3333"),
    WEB_KEY: secret("segredo"),
    BETTER_AUTH_SECRET: secret("segredo"),
    BETTER_AUTH_URL: url("http://localhost:3333"),
    /** URL pública do site, usada nos links dos e-mails (cai em NEXT_PUBLIC_SITE_URL se vazia). */
    SITE_URL: url("http://localhost:3000").default("http://localhost:3000"),
    /** Pasta das imagens dos presentes enviadas pelo painel (servidas em /uploads). */
    UPLOAD_DIR: z.string().default(DEFAULT_UPLOAD_DIR),
    /** SMTP. Com MAIL_HOST vazio, os e-mails só são impressos no console. */
    MAIL_HOST: z.string().optional(),
    MAIL_PORT: z.coerce.number().int().positive().default(587),
    MAIL_USER: z.string().optional(),
    MAIL_PASS: z.string().optional(),
    MAIL_FROM: z.string().default("Dani & Gustavo <nao-responda@localhost>"),
    /** E-mails dos noivos: login do painel e avisos de presente recebido. */
    ADMIN_EMAIL_1: z.email({ error: "deve ser um e-mail válido" }).optional(),
    ADMIN_EMAIL_2: z.email({ error: "deve ser um e-mail válido" }).optional(),
    /** Avisos no Telegram (opcional): token do bot e id do chat. */
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),
    /**
     * Provedor de pagamento. Vazio: "mercadopago" se MP_ACCESS_TOKEN existir, senão
     * "simulado" (Pix e cartão de mentira, para desenvolver sem conta no Mercado Pago).
     */
    PAYMENT_PROVIDER: z
      .enum(["simulado", "mercadopago"], { error: "use simulado ou mercadopago" })
      .optional(),
    MP_ACCESS_TOKEN: z.string().optional(),
    MP_PUBLIC_KEY: z.string().optional(),
    MP_WEBHOOK_SECRET: z.string().optional(),
    MP_API_URL: url("https://api.mercadopago.com").default("https://api.mercadopago.com"),
  })
  .transform((e) => ({
    ...e,
    PAYMENT_PROVIDER: e.PAYMENT_PROVIDER ?? (e.MP_ACCESS_TOKEN ? "mercadopago" : "simulado"),
  }))
  .superRefine((e, ctx) => {
    if (e.PAYMENT_PROVIDER !== "mercadopago") return;
    for (const key of ["MP_ACCESS_TOKEN", "MP_PUBLIC_KEY", "MP_WEBHOOK_SECRET"] as const) {
      if (!e[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "é obrigatória com PAYMENT_PROVIDER=mercadopago (veja docs/PERSONALIZAR.md)",
        });
      }
    }
  });

export type Env = z.output<typeof envSchema>;

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
  const cleaned: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  cleaned.SITE_URL ??= cleaned.NEXT_PUBLIC_SITE_URL;
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => {
        const key = issue.path.join(".");
        const message =
          cleaned[key] === undefined && issue.code !== "custom"
            ? "não foi definida"
            : issue.message;
        return `${key}: ${message}`;
      }),
    );
  }
  return result.data;
}
