import Link from "next/link";
import type { ReactNode } from "react";
import { PLATFORM_NAME } from "./brand";

/** Cabeçalho e rodapé do site da plataforma (Server Component). */
export function PlataformaShell({
  painelUrl,
  children,
}: {
  painelUrl: string | null;
  children: ReactNode;
}) {
  return (
    <div className="plataforma-shell">
      <header className="plataforma-header">
        <nav
          aria-label="Principal"
          className="plataforma-wrap flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 py-3"
        >
          <Link href="/" className="font-display text-xl no-underline">
            {PLATFORM_NAME}
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-xs uppercase tracking-[0.18em]">
            <Link href="/precos" className="no-underline hover:underline">
              Preços
            </Link>
            {painelUrl ? (
              <a href={painelUrl} className="no-underline hover:underline">
                Entrar
              </a>
            ) : null}
            <Link
              href="/cadastro"
              className="rounded-full bg-marinho px-4 py-2 text-branco no-underline"
            >
              Começar
            </Link>
          </div>
        </nav>
      </header>
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <footer className="plataforma-faixa mt-16">
        <div className="plataforma-wrap flex flex-col gap-3 py-10 text-sm md:flex-row md:items-center">
          <p className="font-display text-lg">{PLATFORM_NAME}</p>
          <p className="text-nevoa md:ml-4">Feito com carinho para celebrar quem a gente ama.</p>
          <div className="flex gap-5 md:ml-auto">
            <Link href="/termos">Termos de uso</Link>
            <Link href="/privacidade">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
