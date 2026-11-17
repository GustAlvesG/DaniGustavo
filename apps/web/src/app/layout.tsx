import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost, Pinyon_Script } from "next/font/google";
import { SmoothScroll } from "@/components/motion";
import { getSite } from "@/lib/api/site";
import { siteUrl } from "@/lib/site";
import "./globals.css";

/*
 * Fontes do design "Álbum" (next/font baixa no build e serve do próprio
 * site, sem pedido ao Google no navegador). Cada uma vira uma variável CSS
 * usada pelos tokens de globals.css (--font-serif, --font-sans, --font-script).
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-cormorant",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jost",
});

// Só nos nomes do casal (hero e rodapé).
const pinyon = Pinyon_Script({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-pinyon",
});

// Metadados a partir de /api/site (cacheado): título, descrição e Open Graph.
// `metadataBase` torna absolutas as URLs da imagem OG (o WhatsApp exige).
export async function generateMetadata(): Promise<Metadata> {
  const { seo, couple } = await getSite();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: seo.title, template: `%s | ${couple.names}` },
    description: seo.description,
    applicationName: couple.names,
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: couple.names,
      title: seo.ogTitle,
      description: seo.ogDescription,
      url: "/",
    },
    twitter: { card: "summary_large_image", title: seo.ogTitle, description: seo.ogDescription },
  };
}

// Barra do navegador no celular na cor do menu (marinho).
export const viewport: Viewport = { themeColor: "#14213d", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${cormorant.variable} ${jost.variable} ${pinyon.variable}`}>
      <body className="flex min-h-full flex-col">
        {children}
        <SmoothScroll />
      </body>
    </html>
  );
}
