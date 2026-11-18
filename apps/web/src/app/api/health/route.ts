import { connection } from "next/server";

/**
 * GET /api/health: usado pelo healthcheck do Docker. Não consulta a API nem o banco (o site
 * continua no ar com o conteúdo em cache se a API cair). `await connection()` faz a rota rodar
 * a cada pedido em vez de virar um arquivo estático no build; com `cacheComponents`, é o
 * jeito certo (`export const dynamic` dá erro de build).
 */
export async function GET() {
  await connection();
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
