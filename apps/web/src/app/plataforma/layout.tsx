import { resolveTheme } from "@casamento/shared";
import type { Metadata, Viewport } from "next";
import { PLATFORM_NAME } from "@/components/plataforma/brand";
import { PlataformaShell } from "@/components/plataforma/Shell";
import { painelUrl } from "@/lib/api/platform";
import { themeFontClasses } from "@/themes/fonts";
import { themeColors, themeVars } from "@/themes/vars";
import "../globals.css";
import "./plataforma.css";

/*
 * Fase 6, frente B (docs/saas/fase-6.md): site da plataforma (landing, preços, cadastro, termos
 * e privacidade), servido no host `PLATFORM_HOST` (o proxy.ts reescreve para `/plataforma/...`).
 * Root layout próprio, ao lado de `app/[host]` (eventos), com o visual do Álbum (paleta
 * marinho) e sem nada de evento.
 */

const theme = resolveTheme("wedding");

export const metadata: Metadata = {
  title: { default: PLATFORM_NAME, template: `%s | ${PLATFORM_NAME}` },
  // TODO(conteudo): descrição definitiva para buscadores e compartilhamento.
  description:
    "Site do evento, confirmação de presença, lista de presentes e gestão, num lugar só.",
  // Fora dos buscadores até o lançamento (TODO(conteudo): liberar quando abrir).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: themeColors(theme).bar, colorScheme: "light" };

export default function PlataformaLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={themeFontClasses(theme)}
      data-theme={theme.theme}
      style={themeVars(theme)}
    >
      <body className="flex min-h-full flex-col">
        <PlataformaShell painelUrl={painelUrl()}>{children}</PlataformaShell>
      </body>
    </html>
  );
}
