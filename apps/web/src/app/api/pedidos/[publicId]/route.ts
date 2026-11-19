import { OrderView } from "@casamento/shared";
import { apiReadFresh } from "@/lib/api/client";
import { eventPath, requestEvent } from "@/lib/api/event";

/**
 * GET /api/pedidos/{publicId}: status do pedido para a tela do Pix, consultado
 * pelo navegador a cada 3 s. Route Handler é o "controller JSON" do Next: o
 * navegador fala com o site, e só o servidor fala com a API (a URL da API não
 * vai para o bundle). Devolve só o necessário, sem dados do convidado. O evento vem do
 * header `x-event-host` gravado pelo proxy (Route Handlers não leem root params): o pedido
 * de outro evento dá 404.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/pedidos/[publicId]">) {
  const { publicId } = await ctx.params;
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(publicId)) {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const ev = await requestEvent();
  if (!ev) {
    return Response.json(
      { error: "Evento não encontrado." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const result = await apiReadFresh(eventPath(ev, `/orders/${publicId}`), OrderView);
  if (!result.ok) {
    return Response.json(
      { error: result.error.message },
      { status: result.status === 404 ? 404 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { status: result.data.status, statusDetail: result.data.statusDetail },
    { headers: { "Cache-Control": "no-store" } },
  );
}
