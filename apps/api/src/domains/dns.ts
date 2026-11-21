import { DOMAIN_TXT_PREFIX } from "@casamento/shared";

/*
 * Fase 6, frente B: verificação de domínio próprio por DNS (`node:dns` › `promises.resolveTxt`,
 * sem dependência). O dono cria o TXT `_plataforma-verificacao.<host>` com o
 * `verification_token` do domínio. Injetável nos testes (nunca consultar DNS real em teste).
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

/** Confere o TXT do domínio. Reservado pela fundação. */
export function checkDomainTxt(
  host: string,
  token: string,
  resolveTxt?: TxtResolver,
): Promise<DomainCheck> {
  void host;
  void token;
  void resolveTxt;
  return Promise.resolve({ ok: false, error: "Verificação de domínio ainda não disponível." });
}
