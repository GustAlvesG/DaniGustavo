import type { Metadata } from "next";
import { Bodoni_Moda, Figtree } from "next/font/google";
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
    <html lang="pt-BR" className={`${bodoni.variable} ${figtree.variable}`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
