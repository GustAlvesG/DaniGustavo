import type { Metadata } from "next";
import { Bodoni_Moda, Figtree } from "next/font/google";
import { SmoothScroll } from "@/components/motion";
import { openingInlineScript } from "@/lib/opening";
import "./globals.css";

// Bodoni Moda variável com o eixo opsz: o corte óptico acompanha o tamanho
// (traços finos mais finos em tamanho de cartaz). Mapeada em --font-display.
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-bodoni",
});

// Figtree para texto e interface. Mapeada em --font-sans.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-figtree",
});

export const metadata: Metadata = {
  title: "Dani & Gustavo",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: o script inline pode pôr data-opening no <html>
    // antes da hidratação (o React aceita o DOM em vez de reclamar).
    <html
      lang="pt-BR"
      className={`${bodoni.variable} ${figtree.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Bloqueante e minúsculo: marca a capa da abertura antes do 1º paint. */}
        <script dangerouslySetInnerHTML={{ __html: openingInlineScript() }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <SmoothScroll />
      </body>
    </html>
  );
}
