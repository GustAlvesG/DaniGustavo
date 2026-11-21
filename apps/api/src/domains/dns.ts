import { promises as dnsPromises } from "node:dns";
import { DOMAIN_TXT_PREFIX } from "@casamento/shared";

/*
 * Fase 6, frente B: verificação de domínio próprio por DNS (`node:dns` › `promises.resolveTxt`,
 * sem dependência). O dono cria o TXT `_plataforma-verificacao.<host>` com o
 * `verification_token` do domínio. Injetável nos testes (nunca consultar DNS real em teste):
 * `setTxtResolver(fake)` troca o resolvedor padrão do processo.
 */

export type TxtResolver = (name: string) => Promise<string[][]>;

export interface DomainCheck {
  ok: boolean;
  /** Motivo em pt-BR quando falha (vai para `event_domains.check_error`). */
  error: string | null;
}

/** Nome do registro TXT para um host (sem a porta). */
export function verificationRecordName(host: string): string {
  return `${DOMAIN_TXT_PREFIX}.${host.replace(/:\d+$/, "")}`;
}

const systemResolver: TxtResolver = (name) => dnsPromises.resolveTxt(name);
let current: TxtResolver = systemResolver;

/** Troca o resolvedor padrão (testes). `null` volta ao DNS do sistema. */
export function setTxtResolver(resolver: TxtResolver | null): void {
  current = resolver ?? systemResolver;
}

/** Códigos do `node:dns` de "o nome não tem esse registro" (os demais são falha de consulta). */
const MISSING = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN", "ENONAME"]);
/** `event_domains.check_error` é varchar(191). */
const clip = (s: string) => (s.length > 191 ? `${s.slice(0, 190)}…` : s);

/** Confere o TXT do domínio: algum registro (com os pedaços juntados) igual ao token. */
export async function checkDomainTxt(
  host: string,
  token: string,
  resolveTxt: TxtResolver = current,
): Promise<DomainCheck> {
  const name = verificationRecordName(host);
  let records: string[][];
  try {
    records = await resolveTxt(name);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (MISSING.has(code)) {
      return { ok: false, error: clip(`Não encontramos o registro TXT ${name}.`) };
    }
    return {
      ok: false,
      error: clip(
        `Não deu para consultar o DNS agora${code ? ` (${code})` : ""}. Tente de novo em alguns minutos.`,
      ),
    };
  }
  const values = records.map((chunks) => chunks.join("").trim());
  if (values.includes(token)) return { ok: true, error: null };
  if (values.length === 0) {
    return { ok: false, error: clip(`Não encontramos o registro TXT ${name}.`) };
  }
  return {
    ok: false,
    error: clip(`O registro TXT ${name} existe, mas o valor não confere. Copie o valor de novo.`),
  };
}
