import { fileURLToPath } from "node:url";
import { z } from "zod";
import { asaasEnvFromKey } from "./payments/asaas.ts";

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
    /**
     * Endereço do site visto de dentro do servidor, só para o aviso de revalidação do cache
     * (POST /api/revalidar). Vazio = SITE_URL. Em Docker: http://web:3000 (rede interna).
     */
    WEB_INTERNAL_URL: url("http://web:3000").optional(),
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
     * Provedor de pagamento: "simulado" (padrão; Pix e cartão de mentira, sem conta) ou
     * "asaas". Escolha explícita: ter a chave no .env não liga o Asaas sozinho.
     */
    PAYMENT_PROVIDER: z
      .enum(["simulado", "asaas"], { error: "use simulado ou asaas" })
      .default("simulado"),
    /** Chave de API do Asaas ($aact_hmlg_… no sandbox, $aact_prod_… em produção). Só na API. */
    ASAAS_API_KEY: z.string().optional(),
    /** sandbox ou producao. Vazio: deduzido pelo prefixo da chave. */
    ASAAS_ENV: z.enum(["sandbox", "producao"], { error: "use sandbox ou producao" }).optional(),
    /** Token cadastrado no webhook do Asaas (chega no header asaas-access-token). */
    ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    // Nenhuma mensagem daqui inclui o valor da chave.
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [key], message });
    if (e.ASAAS_API_KEY) {
      const fromKey = asaasEnvFromKey(e.ASAAS_API_KEY);
      if (!fromKey && !e.ASAAS_ENV) {
        issue(
          "ASAAS_ENV",
          "não deu para saber o ambiente pela chave (esperado $aact_hmlg_ ou $aact_prod_): defina sandbox ou producao",
        );
      } else if (fromKey && e.ASAAS_ENV && fromKey !== e.ASAAS_ENV) {
        issue(
          "ASAAS_ENV",
          `diz ${e.ASAAS_ENV}, mas a ASAAS_API_KEY é de ${fromKey}. Use a chave do ambiente certo ou corrija ASAAS_ENV`,
        );
      }
    }
    if (e.PAYMENT_PROVIDER !== "asaas") return;
    if (!e.ASAAS_API_KEY) {
      issue(
        "ASAAS_API_KEY",
        "é obrigatória com PAYMENT_PROVIDER=asaas (veja docs/PERSONALIZAR.md §6)",
      );
    }
    // Em desenvolvimento dá para subir sem o token (sem túnel o webhook nem chega: a API
    // avisa no log e confere o status no Asaas); em produção é obrigatório.
    const token = e.ASAAS_WEBHOOK_TOKEN ?? "";
    const required = e.NODE_ENV === "production";
    if ((required || token) && (token.length < 32 || token.length > 255 || /\s/.test(token))) {
      issue(
        "ASAAS_WEBHOOK_TOKEN",
        `${required ? "é obrigatória em produção com PAYMENT_PROVIDER=asaas" : "fora do padrão do Asaas"}: de 32 a 255 caracteres, sem espaços (o mesmo token cadastrado no webhook do Asaas)`,
      );
    }
  })
  .transform((e) => ({
    ...e,
    /** Ambiente do Asaas já resolvido (ASAAS_ENV ou o prefixo da chave). */
    ASAAS_ENV: e.ASAAS_ENV ?? asaasEnvFromKey(e.ASAAS_API_KEY ?? "") ?? "sandbox",
  }));

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
