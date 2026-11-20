import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEvent } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { decodeHostParam } from "@/lib/host";
import { contentFor } from "@/lib/legacy-content";

export const contentType = "image/svg+xml";

/**
 * Favicon (convenção `icon` do Next, gerada por host): o DG no círculo marinho no
 * casamento original e as iniciais do evento nos outros.
 */
export default async function Icon({ params }: { params: Promise<{ host: string }> }) {
  const ev = await getEvent(decodeHostParam((await params).host));
  const { iniciais } = contentFor(ev);
  const { colors } = (await getSite(ev)).theme;
  const svg = iniciais
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><circle cx="500" cy="500" r="500" fill="${colors.marinho}"/><circle cx="500" cy="500" r="452" fill="none" stroke="${colors.serenity}" stroke-width="10"/><text x="500" y="520" text-anchor="middle" dominant-baseline="central" fill="${colors.branco}" font-family="Georgia, serif" font-size="${iniciais.length > 1 ? 420 : 520}">${iniciais}</text></svg>`
    : await readFile(join(process.cwd(), "src", "app", "_og", "icon-dg.svg"), "utf8");
  return new Response(svg, { headers: { "content-type": contentType } });
}
