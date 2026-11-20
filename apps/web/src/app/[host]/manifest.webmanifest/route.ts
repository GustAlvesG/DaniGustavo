import type { MetadataRoute } from "next";
import { getEvent } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { decodeHostParam } from "@/lib/host";

/**
 * Manifest do app instalável (PWA), um por host. A convenção `app/manifest.ts` só existe na
 * raiz do `app` (fora de `[host]`), então aqui é um Route Handler comum em
 * /manifest.webmanifest, ligado pelo `metadata.manifest` do layout. Nome vem de
 * /api/e/<slug>/site (cacheado); cores do tema do evento.
 */
export async function GET(_req: Request, ctx: RouteContext<"/[host]/manifest.webmanifest">) {
  const ev = await getEvent(decodeHostParam((await ctx.params).host));
  const { couple, seo, theme } = await getSite(ev);
  const manifest: MetadataRoute.Manifest = {
    id: "/",
    name: couple.names,
    short_name: couple.names,
    description: seo.description,
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: theme.colors.papel,
    theme_color: theme.colors.marinho,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
}
