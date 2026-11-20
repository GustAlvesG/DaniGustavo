import { resolveTheme, type ResolvedTheme } from "@casamento/shared";
import type { Metadata, Viewport } from "next";
import { RegistrarSw, SmoothScroll } from "@/components/motion";
import { BUILD_HOST, findCurrentEvent, listPrimaryHosts } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { hostUrl } from "@/lib/site";
import { themeFontClasses } from "@/themes/fonts";
import { themeColors, themeVars } from "@/themes/vars";
import "../globals.css";

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

/** Tema do host (o do tipo "casamento" = Álbum se o host não é de nenhum evento). */
async function currentTheme(): Promise<ResolvedTheme> {
  const ev = await findCurrentEvent();
  return ev ? (await getSite(ev)).theme : resolveTheme("wedding");
}

// Barra do navegador no celular na cor do menu do tema.
export async function generateViewport(): Promise<Viewport> {
  return { themeColor: themeColors(await currentTheme()).bar, colorScheme: "light" };
}

/*
 * O tema do evento vira variáveis CSS no <html> (cores e pilhas de fontes, sobrescrevendo as do
 * Álbum em globals.css), `data-theme` para o desenho de Festa/Moderno e as classes do
 * next/font só das fontes em uso. Álbum + marinho dá os mesmos valores de globals.css.
 */
export default async function RootLayout({ children }: LayoutProps<"/[host]">) {
  const theme = await currentTheme();
  return (
    <html
      lang="pt-BR"
      className={themeFontClasses(theme)}
      data-theme={theme.theme}
      style={themeVars(theme)}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <SmoothScroll />
        <RegistrarSw />
      </body>
    </html>
  );
}
