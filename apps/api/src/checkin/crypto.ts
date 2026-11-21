import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { CHECKIN_PIN_LENGTH } from "@casamento/shared";

/*
 * Fase 7, frente A: segredos da portaria. Token do link só como SHA-256 (hex); PIN só como
 * scrypt; sessão e referência do convite assinadas com HMAC derivado do BETTER_AUTH_SECRET.
 * Tudo com `node:crypto` (sem dependência).
 */

/** Token do link: 32 bytes aleatórios em base64url (43 caracteres). Aparece uma vez. */
export const newLinkToken = () => randomBytes(32).toString("base64url");

export const hashLinkToken = (token: string) => createHash("sha256").update(token).digest("hex");

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** Lixo na URL nem vira consulta. */
export const isLinkTokenShape = (token: string) => TOKEN.test(token);

/** PIN de 6 números, sorteado com `crypto.randomInt` (zeros à esquerda valem). */
export const newPin = () =>
  String(randomInt(0, 10 ** CHECKIN_PIN_LENGTH)).padStart(CHECKIN_PIN_LENGTH, "0");

const SCRYPT_KEYLEN = 32;

function scryptAsync(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** "scrypt$<salt hex>$<hash hex>" */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Hash de mentira para gastar o mesmo tempo quando o token não existe. */
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(SCRYPT_KEYLEN * 2)}`;

/** Confere o PIN em tempo constante; `stored` nulo (link inexistente) também gasta o scrypt. */
export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  const [kind, saltHex, hashHex] = (stored ?? DUMMY_HASH).split("$");
  if (kind !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const key = await scryptAsync(pin, Buffer.from(saltHex, "hex"));
  return stored !== null && expected.length === key.length && timingSafeEqual(expected, key);
}

/* ------------------------------ HMAC ------------------------------ */

const keyOf = (secret: string, purpose: string) =>
  createHash("sha256").update(`casamento:checkin:${purpose}:${secret}`).digest();

const sign = (key: Buffer, data: string, bytes = 32) =>
  createHmac("sha256", key).update(data).digest().subarray(0, bytes).toString("base64url");

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface CheckinSessionClaims {
  eventId: number;
  linkId: number;
  expiresAt: Date;
}

/** Sessão da portaria: `<eventId>.<linkId>.<expira em ms>.<hmac>`. */
export function signSession(secret: string, claims: CheckinSessionClaims): string {
  const data = `${claims.eventId}.${claims.linkId}.${claims.expiresAt.getTime()}`;
  return `${data}.${sign(keyOf(secret, "session"), data)}`;
}

/** Assinatura e prazo; o link ainda precisa ser conferido no banco (revogado/expirado). */
export function readSession(secret: string, token: string, now: Date): CheckinSessionClaims | null {
  const m = /^(\d{1,15})\.(\d{1,15})\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token.trim());
  if (!m) return null;
  const data = `${m[1]}.${m[2]}.${m[3]}`;
  if (!sameText(sign(keyOf(secret, "session"), data), m[4]!)) return null;
  const expiresAt = new Date(Number(m[3]));
  if (expiresAt.getTime() <= now.getTime()) return null;
  return { eventId: Number(m[1]), linkId: Number(m[2]), expiresAt };
}

/**
 * Referência opaca do convite para a portaria e o painel: `<id base36>.<hmac do evento + id>`.
 * Nunca o token do convite (que abre o RSVP); assinada com o evento, então a de outro evento
 * não confere (404).
 */
export function invitationRef(secret: string, eventId: number, invitationId: number): string {
  return `${invitationId.toString(36)}.${sign(keyOf(secret, "ref"), `${eventId}.${invitationId}`, 12)}`;
}

export function readInvitationRef(secret: string, eventId: number, ref: string): number | null {
  const m = /^([0-9a-z]{1,11})\.([A-Za-z0-9_-]{16})$/.exec(ref.trim());
  if (!m) return null;
  const id = parseInt(m[1]!, 36);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return sameText(invitationRef(secret, eventId, id), ref.trim()) ? id : null;
}
