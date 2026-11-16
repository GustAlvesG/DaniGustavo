import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Caminho do `.env` único na raiz do monorepo. */
export const ROOT_ENV_PATH = fileURLToPath(new URL("../../../.env", import.meta.url));

let loaded = false;

/**
 * Carrega o `.env` da raiz, se existir. Variáveis já definidas no ambiente (ex.: CI) têm
 * prioridade: `process.loadEnvFile` não sobrescreve o que já existe.
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  if (existsSync(ROOT_ENV_PATH)) process.loadEnvFile(ROOT_ENV_PATH);
}

export function requireDatabaseUrl(): string {
  loadRootEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Copie .env.example para .env na raiz do projeto e preencha, " +
        "por exemplo: DATABASE_URL=mysql://root:@127.0.0.1:3306/casamento",
    );
  }
  return url;
}
