import type { MetadataRoute } from "next";
import { getSite } from "@/lib/api/site";

/**
 * Manifest do app instalável (PWA). Nome vem de /api/site (cacheado); cores do design
 * "Álbum": marinho na barra e papel no fundo da abertura. `start_url` "/" e
 * `display: standalone` bastam para o Chrome oferecer "Instalar app".
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { couple, seo } = await getSite();
  return {
    id: "/",
    name: couple.names,
    short_name: couple.names,
    description: seo.description,
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f1",
    theme_color: "#14213d",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
