import { createHash, randomBytes } from "node:crypto";

/** Token do convite: 32 bytes aleatórios em base64url (43 caracteres). Vai só no e-mail. */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** O que fica no banco: SHA-256 (hex) do token. Vazou o banco, não vazou convite. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Formato do token antes de ir ao banco (lixo na URL nem vira consulta). */
export const isInviteTokenShape = (token: string) => TOKEN.test(token);

/** "ana@exemplo.com" → "an***@exemplo.com" (prévia do convite para quem não está logado). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length - 1) || 1)}***${email.slice(at)}`;
}
