/*
 * Fase 6, frente D (docs/saas/fase-6.md): endurecimento — saúde, logs estruturados e alertas.
 */

/**
 * GET /api/health. Sem parâmetro: só o processo (barato; healthcheck do Docker e do edge).
 * `?db=1`: também um `SELECT 1` no banco (503 se falhar).
 */
export interface HealthResponse {
  status: "ok" | "error";
  db?: "ok" | "error";
}

/** Níveis dos logs estruturados (uma linha JSON por evento em produção). */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Intervalo mínimo entre dois alertas iguais por e-mail para a plataforma. */
export const ALERT_COOLDOWN_MINUTES = 30;
