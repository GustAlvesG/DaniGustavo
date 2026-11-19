import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<{ motivo: string }>();

/**
 * Marca consultas que atravessam eventos de propósito (rotinas de expiração, conciliação,
 * webhook antes de saber o evento). O auditor de SQL dos testes ignora o que roda aqui dentro.
 */
export function crossEvent<T>(motivo: string, fn: () => T): T {
  if (!motivo.trim()) throw new Error("crossEvent precisa de um motivo.");
  return storage.run({ motivo }, fn);
}

export function isCrossEvent(): boolean {
  return storage.getStore() !== undefined;
}

/** Motivo do crossEvent em curso (para logs), ou null. */
export function crossEventReason(): string | null {
  return storage.getStore()?.motivo ?? null;
}
