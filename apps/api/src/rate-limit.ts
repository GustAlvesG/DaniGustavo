export interface RateLimitResult {
  allowed: boolean;
  /** Segundos até a janela abrir de novo (só quando bloqueado). */
  retryAfter: number;
}

export interface RateLimiter {
  /** Conta uma tentativa para `key` e diz se passou do `limit` na janela de `windowMs`. */
  hit(key: string, limit: number, windowMs: number): RateLimitResult;
  /** Zera todos os contadores (testes). */
  reset(): void;
}

/**
 * Limitador em memória, janela fixa. Serve para uma única VPS/processo: ao reiniciar ou
 * escalar para mais instâncias, os contadores não são compartilhados. Se o site passar a
 * rodar em várias instâncias, troque por Redis/DB mantendo esta interface.
 */
export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key, limit, windowMs) {
      const t = now();
      // Limpeza oportunista para o mapa não crescer sem limite.
      if (windows.size > 1000) {
        for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
      }
      let w = windows.get(key);
      if (!w || w.resetAt <= t) {
        w = { count: 0, resetAt: t + windowMs };
        windows.set(key, w);
      }
      w.count++;
      if (w.count > limit) {
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - t) / 1000)) };
      }
      return { allowed: true, retryAfter: 0 };
    },
    reset() {
      windows.clear();
    },
  };
}
