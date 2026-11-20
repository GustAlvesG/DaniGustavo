import { getEvent } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { monogramOf } from "@/lib/site";
import { decodeHostParam } from "@/lib/host";
import { pwaIcon } from "@/lib/pwa-icon";

// Route Handler não lê root params: o host vem de `params` (o segmento [host] da URL).
export async function GET(_req: Request, ctx: RouteContext<"/[host]/icons/512">) {
  const ev = await getEvent(decodeHostParam((await ctx.params).host));
  const site = await getSite(ev);
  return pwaIcon(512, {
    iniciais: monogramOf(site),
    colors: site.theme.colors,
  });
}
