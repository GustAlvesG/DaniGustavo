import { MonogramDG, Seal } from "@/components/brand";
import { MONOGRAM_ART } from "@/components/tiles";
import { BoardSubheading, Caption } from "./section";

const WEDDING_AT = "2027-04-10T16:00:00-03:00";

/** Monograma DG (preenchido, linha, tamanhos, vertical, selos) e as formas da identidade. */
export function BrandBoard() {
  return (
    <div className="flex flex-col gap-24 lg:gap-32">
      <div>
        <BoardSubheading note="Redesenhado em vetor a partir do arquivo do casal: grossos só na haste do D, no S (bojo do D e corpo do G ao mesmo tempo) e no esporão do G; o resto é fio. Abaixo de uns 160 px, a prop bold engrossa os fios com um contorno da mesma cor.">
          Monograma DG
        </BoardSubheading>
        <div className="page-grid items-end gap-y-12">
          <figure className="flex flex-col gap-4 lg:col-span-5">
            <MonogramDG label="Dani & Gustavo" className="max-w-[360px]" />
            <Caption>Preenchido, 360 px</Caption>
          </figure>
          <figure className="flex flex-col gap-4 lg:col-span-4">
            <svg viewBox={MONOGRAM_ART.viewBox} className="w-full max-w-[280px]" aria-hidden="true">
              <g fill="currentColor" className="text-ink/15">
                {MONOGRAM_ART.parts
                  .filter((p) => p.id !== "esporao")
                  .map((p) => (
                    <path key={p.id} d={p.d} />
                  ))}
              </g>
              <g fill="none" stroke="currentColor" strokeWidth="4" className="text-accent">
                {MONOGRAM_ART.parts.map((p) => (
                  <path key={p.id} d={p.line} />
                ))}
              </g>
            </svg>
            <Caption>Linhas de escrita (a abertura desenha estas; a tinta vem atrás)</Caption>
          </figure>
          <figure className="flex flex-col gap-4 lg:col-span-2">
            <MonogramDG bold={10} className="max-w-[96px]" />
            <Caption>96 px, bold 10</Caption>
          </figure>
          <figure className="flex flex-col gap-4 lg:col-span-1">
            <MonogramDG bold={24} className="max-w-[40px]" />
            <Caption>40 px, bold 24</Caption>
          </figure>
        </div>
      </div>

      <div>
        <BoardSubheading note="Como o casal usa: na vertical, num arco marinho, e no selo redondo com a data (10.04.27).">
          Vertical e selos
        </BoardSubheading>
        <div className="flex flex-wrap items-end gap-x-12 gap-y-10">
          <figure className="flex flex-col gap-4">
            <div className="card-marinho shape-arch grid aspect-[3/4] w-48 place-items-center [--arch-rise:37.5%]">
              <MonogramDG vertical bold={8} className="w-[56%]" />
            </div>
            <Caption>Vertical, arco marinho</Caption>
          </figure>
          <figure className="flex flex-col gap-4">
            <Seal date={WEDDING_AT} size="10rem" />
            <Caption>Selo marinho</Caption>
          </figure>
          <figure className="flex flex-col gap-4">
            <Seal date={WEDDING_AT} tone="relevo" size="10rem" />
            <Caption>Selo relevo</Caption>
          </figure>
          <figure className="flex flex-col gap-4">
            <Seal date={WEDDING_AT} tone="royal" size="7rem" />
            <Caption>Selo royal, menor</Caption>
          </figure>
        </div>
      </div>

      <div>
        <BoardSubheading note="Três formas dos cartões do casal, alternadas (nunca o mesmo raio em tudo): arco para painéis em pé e fotos, cápsula para botões e faixas de informação, círculo para selos e amostras. O resto da página fica aberto, sem moldura.">
          Formas
        </BoardSubheading>
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_0.9fr] lg:items-end">
          <figure className="flex flex-col gap-4">
            <div className="surface-relevo card-relevo shape-arch flex aspect-[3/4] flex-col items-center justify-end gap-2 p-8 text-center [--arch-rise:37.5%]">
              <p className="font-display text-2xl text-ink">Madrinhas</p>
              <p className="text-sm text-ink-soft">
                Arco de relevo: campo claro, moldura royal, fio serenity por fora.
              </p>
            </div>
            <Caption>shape-arch + card-relevo</Caption>
          </figure>
          <figure className="flex flex-col gap-4">
            <div className="surface-relevo card-relevo flex min-h-40 items-center rounded-full px-14 py-8">
              <p className="text-base text-ink">
                Cápsula: a faixa do manual (músicas e fotos), e os botões.
              </p>
            </div>
            <Caption>shape-pill + card-relevo</Caption>
          </figure>
          <figure className="flex flex-col gap-4">
            <div className="card-marinho shape-seal grid w-full max-w-56 place-items-center p-8 text-center">
              <p className="font-display text-xl text-ink">Selo</p>
            </div>
            <Caption>shape-seal + card-marinho</Caption>
          </figure>
        </div>
      </div>
    </div>
  );
}
