import Link from "next/link";
import { ViewTransition } from "react";
import { Monogram, TileBand } from "@/components/tiles";
import type { TileDesign } from "@/components/tiles";
import { NavLinks } from "./NavLinks";

/**
 * Cabeçalho das páginas internas: o monograma leva para a home e é o
 * elemento compartilhado da View Transition (o mesmo nome no painel do hero),
 * então ele "voa" entre as páginas. Na home o próprio hero faz esse papel.
 */
export function SiteHeader({ band = "trama" }: { band?: TileDesign }) {
  return (
    <header>
      <div className="page-wrap flex items-center justify-between gap-6 py-4 lg:py-6">
        <Link
          href="/"
          className="-m-2 inline-flex min-h-11 items-center rounded-[2px] p-2"
          aria-label="Dani & Gustavo, página inicial"
        >
          <ViewTransition name="monograma" share="monograma" default="none">
            <span className="block w-14 sm:w-[4.5rem] lg:w-24">
              <Monogram weight={2.1} />
            </span>
          </ViewTransition>
        </Link>
        <nav aria-label="Principal">
          <NavLinks className="justify-end" />
        </nav>
      </div>
      <TileBand design={band} animate={false} />
    </header>
  );
}
