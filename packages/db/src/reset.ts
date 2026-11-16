import type { RowDataPacket } from "mysql2";
import type { Database } from "./client.ts";

/** Apaga todas as tabelas do banco atual (inclusive o controle de migrations). Só para dev/teste. */
export async function resetDatabase(db: Database): Promise<void> {
  const conn = await db.$client.getConnection();
  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const row of rows) {
      await conn.query(`DROP TABLE IF EXISTS \`${String(row.name)}\``);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}
