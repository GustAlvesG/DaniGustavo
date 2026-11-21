/**
 * Repete uma transação que o MySQL/MariaDB derrubou por deadlock (1213) ou espera de lock
 * (1205). O InnoDB escolhe uma vítima quando duas transações travam linhas e lacunas de índice
 * em ordem diferente (ex.: duas compras do mesmo evento gravando em `payments` ao mesmo tempo) e
 * manda a aplicação repetir; a transação inteira já foi desfeita, então repetir é seguro desde
 * que o callback só mexa no banco.
 */
export async function withDeadlockRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries || !isLockConflict(err)) throw err;
      await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 40));
    }
  }
}

/** Erro de deadlock/espera de lock, direto do mysql2 ou embrulhado pelo Drizzle (`cause`). */
export function isLockConflict(err: unknown): boolean {
  const e = err as { errno?: number; cause?: { errno?: number } } | null;
  const code = e?.cause?.errno ?? e?.errno;
  return code === 1213 || code === 1205;
}
