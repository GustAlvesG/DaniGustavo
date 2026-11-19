import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { CACHE_TAGS, EVENT_TAG_KINDS } from "@/lib/api/tags";

const digest = (v: string) => createHash("sha256").update(v).digest();

const Body = z.object({
  eventId: z.number().int().positive(),
  tags: z.array(z.enum(EVENT_TAG_KINDS)).min(1),
});

/**
 * POST /api/revalidar: a API avisa que o painel mudou algo de um evento (presentes,
 * conteúdo, recados) e o site descarta o cache dessas tags SÓ daquele evento
 * (`{ eventId: 12, tags: ["gifts"] }` → tag `gifts:12`). Protegido pelo mesmo segredo
 * X-Web-Key que o site usa para falar com a API. Fica fora do proxy (não depende do host).
 * `expire: 0` faz a próxima visita já buscar o dado novo (é o equivalente a um
 * `Cache::tags(...)->flush()` do Laravel).
 */
export async function POST(req: Request) {
  const expected = process.env.WEB_KEY;
  const provided = req.headers.get("x-web-key");
  if (!expected || !provided || !timingSafeEqual(digest(provided), digest(expected))) {
    return Response.json({ error: "Chave inválida." }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    json = undefined;
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: `Envie { eventId, tags: [...] } com ${EVENT_TAG_KINDS.join(", ")}.` },
      { status: 422 },
    );
  }
  const { eventId, tags } = parsed.data;
  const revalidated = tags.map((kind) => CACHE_TAGS[kind](eventId));
  for (const tag of revalidated) revalidateTag(tag, { expire: 0 });
  return Response.json({ ok: true, revalidated });
}
