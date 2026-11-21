import type { Metadata } from "next";
import "../globals.css";

/*
 * Fase 6, frente B (docs/saas/fase-6.md): site da plataforma (landing, preços, cadastro, termos
 * e privacidade), servido no host `PLATFORM_HOST` (o proxy.ts reescreve para `/plataforma/...`).
 * Root layout próprio, ao lado de `app/[host]` (eventos). Reservado pela fundação.
 */

export const metadata: Metadata = {
  title: "Plataforma de eventos",
  robots: { index: false, follow: false },
};

export default function PlataformaLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
