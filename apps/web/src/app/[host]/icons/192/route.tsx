import { getEvent } from "@/lib/api/event";
import { contentFor } from "@/lib/legacy-content";
import { decodeHostParam } from "@/lib/host";
import { pwaIcon } from "@/lib/pwa-icon";

// Route Handler não lê root params: o host vem de `params` (o segmento [host] da URL).
export async function GET(_req: Request, ctx: RouteContext<"/[host]/icons/192">) {
  const ev = await getEvent(decodeHostParam((await ctx.params).host));
  return pwaIcon(192, { iniciais: contentFor(ev).iniciais });
}
