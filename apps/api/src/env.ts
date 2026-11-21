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
    MAIL_FROM: z.string().default("nao-responda@localhost"),
    /** E-mails dos noivos: só o seed os usa (usuários do painel). Os avisos vão aos membros do evento. */
    ADMIN_EMAIL_1: z.email({ error: "deve ser um e-mail válido" }).optional(),
    ADMIN_EMAIL_2: z.email({ error: "deve ser um e-mail válido" }).optional(),
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
    /**
     * Fase 5: chave mestra (64 hex, `openssl rand -hex 32`) que cifra em repouso a apiKey das
     * subcontas (AES-256-GCM, src/crypto/secret-box.ts). Obrigatória em produção; fora dela,
     * vazia = chave derivada do BETTER_AUTH_SECRET. Trocar a chave invalida as já gravadas.
     */
    PAYMENT_SECRETS_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, {
        error: "deve ter 64 caracteres hexadecimais (gere com: openssl rand -hex 32)",
      })
      .optional(),
    /**
     * Fase 5/6: percentual da plataforma descontado por split de cada presente pago numa
     * subconta (0 a 50). Desde a Fase 6 vale só para organização SEM assinatura: a taxa vem do
     * plano (`plans.fee_bps`, padrão 0,5%, decisão de 21/11/2026). Vazio = 0,5.
     */
    PLATFORM_FEE_PERCENT: z.coerce
      .number({ error: "deve ser um número, ex.: 2.5" })
      .min(0, { error: "não pode ser negativo" })
      .max(50, { error: "no máximo 50" })
      .default(0.5),
    /** Fase 5: walletId da conta principal do Asaas, destino do split da plataforma. */
    ASAAS_PLATFORM_WALLET_ID: z.string().max(64).optional(),
    /**
     * Fase 6: provedor da assinatura das organizações: "simulado" (padrão) ou "asaas" (conta
     * principal, a mesma ASAAS_API_KEY). Escolha explícita, como PAYMENT_PROVIDER.
     */
    BILLING_PROVIDER: z
      .enum(["simulado", "asaas"], { error: "use simulado ou asaas" })
      .default("simulado"),
    /**
     * Fase 6: domínio base dos endereços automáticos (`<slug>.<base>`, ex.: eventos.artzan.tech).
     * Vazio = sem subdomínio automático (decisão de 21/11/2026: definir depois).
     */
    PLATFORM_BASE_DOMAIN: z
      .string()
      .regex(/^[a-z0-9.-]+(:\d+)?$/, { error: "use só o domínio, ex.: eventos.exemplo.com" })
      .optional(),
    /**
     * Fase 6: host do site da plataforma (landing, preços, cadastro), como chega no Host, ex.:
     * plataforma.artzan.tech ou localhost:3000. Vazio = sem landing (o Host cai nos eventos).
     */
    PLATFORM_HOST: z
      .string()
      .regex(/^[a-z0-9.-]+(:\d+)?$/, { error: "use só o host, ex.: plataforma.exemplo.com" })
      .optional(),
    /** Fase 6: cadastro self-service aberto (1) ou fechado (0, padrão). */
    SIGNUP_ENABLED: z
      .enum(["0", "1", "true", "false"], { error: "use 1 ou 0" })
      .default("0")
      .transform((v) => v === "1" || v === "true"),
    /** Fase 6: e-mail que recebe os alertas da plataforma (rotinas falhando, erros 5xx). */
    PLATFORM_ALERT_EMAIL: z.email({ error: "deve ser um e-mail válido" }).optional(),
    /** Fase 6: formato dos logs: json (padrão em produção) ou texto (padrão fora dela). */
    LOG_FORMAT: z.enum(["json", "texto"], { error: "use json ou texto" }).optional(),
  })
  .superRefine((e, ctx) => {
    // Nenhuma mensagem daqui inclui o valor da chave.
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [key], message });
    if (e.NODE_ENV === "production" && !e.PAYMENT_SECRETS_KEY) {
      issue(
        "PAYMENT_SECRETS_KEY",
        "é obrigatória em produção (cifra a chave das subcontas): openssl rand -hex 32",
      );
    }
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
    if (e.BILLING_PROVIDER === "asaas" && !e.ASAAS_API_KEY) {
      issue("ASAAS_API_KEY", "é obrigatória com BILLING_PROVIDER=asaas (conta principal do Asaas)");
    }
    if (e.PAYMENT_PROVIDER !== "asaas") return;
    if (!e.ASAAS_API_KEY) {
      issue(
        "ASAAS_API_KEY",
        "é obrigatória com PAYMENT_PROVIDER=asaas (veja docs/PERSONALIZAR.md §6)",
      );
    }
    // Fase 6: a taxa vem do plano de cada organização, então a carteira da plataforma não é
    // mais exigida aqui: sem ela, evento de subconta com taxa > 0 fica sem presentes em dinheiro
    // (payment-accounts/resolve.ts) e a API avisa no log ao subir.
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

/**
 * Produção com o provedor simulado não recebe dinheiro de verdade (o Asaas ainda não foi testado):
 * os presentes em dinheiro ficam indisponíveis em todos os eventos (como "sem conta aprovada").
 * Fora de produção (dev, CI, e2e) o simulado continua aprovando pagamentos de mentira.
 */
export function paymentsLive(env: Pick<Env, "NODE_ENV" | "PAYMENT_PROVIDER">): boolean {
  return !(env.NODE_ENV === "production" && env.PAYMENT_PROVIDER === "simulado");
}

/**
 * Produção com a assinatura simulada: nada é cobrado e não há inadimplência nem bloqueio por
 * fim de teste (nenhum 402 por assinatura); os limites do plano continuam valendo.
 */
export function billingLive(env: Pick<Env, "NODE_ENV" | "BILLING_PROVIDER">): boolean {
  return !(env.NODE_ENV === "production" && env.BILLING_PROVIDER === "simulado");
}

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
