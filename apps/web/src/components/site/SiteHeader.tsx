import Link from "next/link";
import { ViewTransition } from "react";
import { MonogramDG } from "@/components/brand";
import { TileBand } from "@/components/tiles";
import type { TileDesign } from "@/components/tiles";
import { NavLinks } from "./NavLinks";

/**
 * Cabeçalho das páginas internas, no marinho: o DG leva para a home e é o
 * elemento compartilhado da View Transition (o mesmo nome no arco do hero),
 * então ele "voa" entre as páginas. Na home o próprio hero faz esse papel.
 */
export function SiteHeader({ band = "trama" }: { band?: TileDesign }) {
  return (
    <header>
      <div className="page-wrap flex items-center justify-between gap-6 py-4 lg:py-6">
        <Link
          href="/"
          className="-m-2 inline-flex min-h-11 items-center rounded-[4px] p-2 text-ink"
          aria-label="Dani & Gustavo, página inicial"
        >
          <ViewTransition name="monograma" share="monograma" default="none">
            <span className="block w-[4.25rem] sm:w-20 lg:w-24">
              <MonogramDG bold={10} />
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
