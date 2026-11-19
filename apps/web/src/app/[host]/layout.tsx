import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost, Pinyon_Script } from "next/font/google";
import { RegistrarSw, SmoothScroll } from "@/components/motion";
import { BUILD_HOST, findCurrentEvent, listPrimaryHosts } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { hostUrl } from "@/lib/site";
import "../globals.css";

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

/*
 * Root layout de cada evento: `app/[host]` recebe o Host da requisição (o proxy reescreve
 * `/presentes` para `/<host>/presentes`). `host` é um root param (`next/root-params`), então
 * qualquer Server Component lê o evento com `currentEvent()`, sem passar props.
 */

/**
 * Com `cacheComponents`, todo root param precisa de pelo menos um valor no build: os hosts
 * primários dos eventos ativos. Com a API fora do ar (CI), sai só o host reserva
 * `build.invalid`, com o conteúdo de reserva; os outros hosts são gerados na 1ª visita.
 */
export async function generateStaticParams() {
  const hosts = await listPrimaryHosts();
  return (hosts.length ? hosts : [BUILD_HOST]).map((host) => ({ host }));
}

// Metadados a partir de /api/e/<slug>/site (cacheado): título, descrição e Open Graph.
// `metadataBase` torna absolutas as URLs da imagem OG (o WhatsApp exige).
export async function generateMetadata(): Promise<Metadata> {
  const ev = await findCurrentEvent();
  // Host de nenhum evento: a página é o 404 neutro de not-found.tsx.
  if (!ev) return { title: "Site não encontrado", robots: { index: false, follow: false } };
  const { seo, couple } = await getSite(ev);
  return {
    metadataBase: new URL(hostUrl(ev.primaryHost)),
    title: { default: seo.title, template: `%s | ${couple.names}` },
    description: seo.description,
    applicationName: couple.names,
    manifest: "/manifest.webmanifest",
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

export default function RootLayout({ children }: LayoutProps<"/[host]">) {
  return (
    <html lang="pt-BR" className={`${cormorant.variable} ${jost.variable} ${pinyon.variable}`}>
      <body className="flex min-h-full flex-col">
        {children}
        <SmoothScroll />
        <RegistrarSw />
      </body>
    </html>
  );
}
