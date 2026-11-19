import mysql from "mysql2/promise";

/**
 * URL do banco de testes ao lado do servidor de DATABASE_URL: `<banco>_<sufixo>` (ou, se
 * `TEST_DATABASE_URL` existir, ela). Nunca devolve o banco de desenvolvimento.
 */
export function testDatabaseUrl(baseUrl: string, suffix: string): string {
  const override = process.env.TEST_DATABASE_URL;
  if (override) return override;
  const url = new URL(baseUrl);
  const name = url.pathname.replace(/^\//, "") || "casamento";
  url.pathname = `/${name.endsWith(`_${suffix}`) ? name : `${name}_${suffix}`}`;
  return url.toString();
}

/** Cria o banco da URL, se ainda não existir (conecta ao servidor sem selecionar banco). */
export async function ensureDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/^\w+$/.test(name)) throw new Error(`Nome de banco inválido: ${name}`);
  url.pathname = "/";
  const admin = await mysql.createConnection({ uri: url.toString() });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await admin.end();
  }
}
