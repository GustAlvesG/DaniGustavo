import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEvent } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { decodeHostParam } from "@/lib/host";
import { monogramOf } from "@/lib/site";

export const contentType = "image/svg+xml";

/**
 * Favicon (convenção `icon` do Next, gerada por host): a arte do monograma (ex.: o DG) quando o
 * evento tem uma, senão as iniciais do evento no círculo do tema.
 */
export default async function Icon({ params }: { params: Promise<{ host: string }> }) {
  const ev = await getEvent(decodeHostParam((await params).host));
  const site = await getSite(ev);
  const iniciais = monogramOf(site);
  const { colors } = site.theme;
  const svg = iniciais
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><circle cx="500" cy="500" r="500" fill="${colors.marinho}"/><circle cx="500" cy="500" r="452" fill="none" stroke="${colors.serenity}" stroke-width="10"/><text x="500" y="520" text-anchor="middle" dominant-baseline="central" fill="${colors.branco}" font-family="Georgia, serif" font-size="${iniciais.length > 1 ? 420 : 520}">${iniciais}</text></svg>`
    : await readFile(join(process.cwd(), "src", "app", "_og", "icon-dg.svg"), "utf8");
  return new Response(svg, { headers: { "content-type": contentType } });
}
