import { describe, expect, it } from "vitest";
import {
  createSecretBox,
  deriveDevKey,
  newWebhookToken,
  parseMasterKey,
  paymentAccountAad,
  secretBoxFromEnv,
  SecretBoxError,
  sha256Hex,
  tokenMatchesHash,
} from "../src/crypto/secret-box.ts";

// Fase 5: a apiKey das subcontas fica cifrada em repouso (AES-256-GCM, chave mestra no env).

const KEY = "a".repeat(64);
const box = createSecretBox(parseMasterKey(KEY));
const aad = paymentAccountAad("01JABCDEFGHJKMNPQRSTVWXYZ0");
const apiKey = "$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmFiYw==";

describe("secret-box", () => {
  it("cifra e decifra com o mesmo aad", () => {
    const sealed = box.seal(apiKey, aad);
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain("aact");
    expect(box.open(sealed, aad)).toBe(apiKey);
  });

  it("iv novo a cada valor (o mesmo texto nunca gera o mesmo cifrado)", () => {
    expect(box.seal(apiKey, aad)).not.toBe(box.seal(apiKey, aad));
  });

  it("aad de outra linha, outra chave ou valor adulterado → SecretBoxError", () => {
    const sealed = box.seal(apiKey, aad);
    expect(() => box.open(sealed, paymentAccountAad("outra"))).toThrow(SecretBoxError);
    const other = createSecretBox(parseMasterKey("b".repeat(64)));
    expect(() => other.open(sealed, aad)).toThrow(SecretBoxError);
    const parts = sealed.split(".");
    const data = Buffer.from(parts[3]!, "base64url");
    data[0] = data[0]! ^ 1;
    parts[3] = data.toString("base64url");
    expect(() => box.open(parts.join("."), aad)).toThrow(SecretBoxError);
    expect(() => box.open("v2.a.b.c", aad)).toThrow(SecretBoxError);
    expect(() => box.open("lixo", aad)).toThrow(SecretBoxError);
  });

  it("a mensagem de erro nunca traz o segredo", () => {
    try {
      box.open(box.seal(apiKey, aad), "x");
    } catch (err) {
      expect(String(err)).not.toContain("aact");
    }
  });

  it("chave mestra: 64 hex, senão erro em pt-BR", () => {
    expect(() => parseMasterKey("curta")).toThrow(/64 caracteres hexadecimais/);
    expect(() => parseMasterKey("z".repeat(64))).toThrow(SecretBoxError);
    expect(parseMasterKey(KEY)).toHaveLength(32);
  });

  it("pelo env: exige a chave em produção; fora dela deriva do BETTER_AUTH_SECRET", () => {
    const base = { BETTER_AUTH_SECRET: "s".repeat(40) };
    expect(() => secretBoxFromEnv({ ...base, NODE_ENV: "production" })).toThrow(
      /obrigatória em produção/,
    );
    const dev = secretBoxFromEnv({ ...base, NODE_ENV: "development" });
    const sealed = dev.seal("x", "y");
    expect(createSecretBox(deriveDevKey(base.BETTER_AUTH_SECRET)).open(sealed, "y")).toBe("x");
    const prod = secretBoxFromEnv({ ...base, NODE_ENV: "production", PAYMENT_SECRETS_KEY: KEY });
    expect(box.open(prod.seal("y", "z"), "z")).toBe("y");
  });

  it("token do webhook: grava só o hash e confere em tempo constante", () => {
    const token = newWebhookToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const hash = sha256Hex(token);
    expect(tokenMatchesHash(token, hash)).toBe(true);
    expect(tokenMatchesHash(`${token}x`, hash)).toBe(false);
    expect(tokenMatchesHash(undefined, hash)).toBe(false);
    expect(tokenMatchesHash(token, null)).toBe(false);
    expect(tokenMatchesHash(token, "nao-e-hash")).toBe(false);
  });
});
