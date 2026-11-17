import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/api/tags";

const VALID_TAGS = new Set<string>(Object.values(CACHE_TAGS));
const digest = (v: string) => createHash("sha256").update(v).digest();

/**
 * POST /api/revalidar: a API avisa que o painel mudou algo (presentes, conteúdo, recados) e
 * o site descarta o cache dessas tags. Protegido pelo mesmo segredo X-Web-Key que o site usa
 * para falar com a API. `expire: 0` faz a próxima visita já buscar o dado novo (é o
 * equivalente a um `Cache::tags(...)->flush()` do Laravel).
 */
export async function POST(req: Request) {
  const expected = process.env.WEB_KEY;
  const provided = req.headers.get("x-web-key");
  if (!expected || !provided || !timingSafeEqual(digest(provided), digest(expected))) {
    return Response.json({ error: "Chave inválida." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  const tags = (body as { tags?: unknown } | undefined)?.tags;
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string" && VALID_TAGS.has(t))) {
    return Response.json(
      { error: `Envie { tags: [...] } com ${[...VALID_TAGS].join(", ")}.` },
      { status: 422 },
    );
  }
  for (const tag of tags as string[]) revalidateTag(tag, { expire: 0 });
  return Response.json({ ok: true, revalidated: tags });
}
