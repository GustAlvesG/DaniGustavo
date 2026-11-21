import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/*
 * Fase 5 (docs/saas/fase-5.md): segredos em repouso (a apiKey de cada subconta do Asaas).
 * AES-256-GCM do `crypto` do Node, sem dependência. A chave mestra vem de PAYMENT_SECRETS_KEY
 * (64 caracteres hex = 32 bytes; `openssl rand -hex 32`), obrigatória em produção. Fora de
 * produção, sem ela, deriva-se uma chave do BETTER_AUTH_SECRET (HKDF) só para desenvolver.
 *
 * Formato gravado: `v1.<iv>.<tag>.<cifrado>` (base64url; iv de 12 bytes aleatório por valor,
 * tag de 16). O `aad` (dado associado) amarra o valor ao dono (ex.: `payment_account:<publicId>`):
 * copiar o cifrado para outra linha faz a abertura falhar. Nada aqui loga o segredo.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface SecretBox {
  /** Cifra `plain` amarrado a `aad`. */
  seal(plain: string, aad: string): string;
  /** Decifra; lança `SecretBoxError` se a chave, o `aad` ou o valor não baterem. */
  open(sealed: string, aad: string): string;
}

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

/** Chave mestra em hex (64 caracteres) → 32 bytes. Lança com mensagem em pt-BR. */
export function parseMasterKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new SecretBoxError(
      "PAYMENT_SECRETS_KEY deve ter 64 caracteres hexadecimais (gere com: openssl rand -hex 32).",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Chave de desenvolvimento derivada de outro segredo (nunca em produção). */
export function deriveDevKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "casamento", "payment-secrets-dev-v1", 32));
}

export function createSecretBox(key: Buffer): SecretBox {
  if (key.length !== 32) throw new SecretBoxError("A chave do AES-256-GCM precisa de 32 bytes.");
  return {
    seal(plain, aad) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(Buffer.from(aad, "utf8"));
      const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv, tag, data]
        .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
        .join(".");
    },
    open(sealed, aad) {
      const parts = sealed.split(".");
      if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new SecretBoxError("Segredo cifrado em formato desconhecido.");
      }
      const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
      const iv = Buffer.from(ivB64, "base64url");
      const tag = Buffer.from(tagB64, "base64url");
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new SecretBoxError("Segredo cifrado em formato desconhecido.");
      }
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
        decipher.setAAD(Buffer.from(aad, "utf8"));
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([
          decipher.update(Buffer.from(dataB64, "base64url")),
          decipher.final(),
        ]);
        return plain.toString("utf8");
      } catch {
        // Sem detalhes: chave mestra trocada, aad de outra linha ou valor adulterado.
        throw new SecretBoxError("Não deu para abrir o segredo (chave mestra ou dono diferentes).");
      }
    },
  };
}

/** Caixa pela configuração: PAYMENT_SECRETS_KEY, ou chave derivada fora de produção. */
export function secretBoxFromEnv(env: {
  NODE_ENV: string;
  PAYMENT_SECRETS_KEY?: string;
  BETTER_AUTH_SECRET: string;
}): SecretBox {
  if (env.PAYMENT_SECRETS_KEY) return createSecretBox(parseMasterKey(env.PAYMENT_SECRETS_KEY));
  if (env.NODE_ENV === "production") {
    throw new SecretBoxError("PAYMENT_SECRETS_KEY é obrigatória em produção.");
  }
  return createSecretBox(deriveDevKey(env.BETTER_AUTH_SECRET));
}

/** A caixa das dependências, ou a do env quando não veio (rotinas e testes antigos). */
export function secretsOf(deps: {
  secrets?: SecretBox;
  env: Parameters<typeof secretBoxFromEnv>[0];
}): SecretBox {
  return deps.secrets ?? secretBoxFromEnv(deps.env);
}

/** `aad` da apiKey de uma subconta. */
export const paymentAccountAad = (publicId: string) => `payment_account:${publicId}`;

/** Token novo para o webhook de uma subconta (64 hex; o Asaas aceita de 32 a 255). */
export const newWebhookToken = () => randomBytes(32).toString("hex");

/** SHA-256 em hex (o que se grava do token do webhook). */
export const sha256Hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

/** Confere um token recebido contra o hash gravado, em tempo constante. */
export function tokenMatchesHash(token: string | undefined, hash: string | null): boolean {
  if (!token || !hash || !/^[0-9a-f]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(sha256Hex(token), "hex"), Buffer.from(hash, "hex"));
}
