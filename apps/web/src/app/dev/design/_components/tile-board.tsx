import { Monogram, Tile, TILE_ART, TILE_DESIGNS, TileBand, TileGrid } from "@/components/tiles";
import type { TileRotation } from "@/components/tiles";
import { BoardSubheading, Caption } from "./section";

const ROTATIONS: TileRotation[] = [0, 90, 180, 270];

export function TileBoard() {
  return (
    <div className="flex flex-col gap-24 lg:gap-32">
      <div>
        <BoardSubheading note="Oito desenhos próprios, cada um nas quatro rotações. A rotação vai na geometria do SVG, não em CSS.">
          Desenhos e rotações
        </BoardSubheading>
        <ul className="flex flex-col">
          {TILE_DESIGNS.map((design) => {
            const art = TILE_ART[design];
            return (
              <li
                key={design}
                className="page-grid gap-y-5 border-t border-nevoa py-6 lg:items-center lg:py-8"
              >
                <div className="flex flex-col gap-1 lg:col-span-4">
                  <span className="font-display text-2xl text-tinta">{art.label}</span>
                  <code className="font-mono text-xs text-cobalto">
                    design=&quot;{design}&quot;
                  </code>
                  <p className="mt-1 max-w-[42ch] text-sm text-tinta/75">{art.idea}</p>
                </div>
                <div className="grid grid-cols-4 gap-3 lg:col-span-7 lg:col-start-6 lg:gap-5">
                  {ROTATIONS.map((r) => (
                    <figure key={r} className="flex flex-col gap-2">
                      <Tile design={design} rotate={r} className="ring-1 ring-nevoa" />
                      <figcaption className="text-xs tabular-nums text-tinta/65">{r}°</figcaption>
                    </figure>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <BoardSubheading note="Blocos 2×2 no padrão do desenho (roseta: 0°, 90°, 270°, 180°). O que sai por uma borda entra pela vizinha.">
          Como fecham
        </BoardSubheading>
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4 lg:gap-x-8 lg:gap-y-14">
          {TILE_DESIGNS.map((design) => (
            <figure key={design} className="flex flex-col gap-3">
              <TileGrid design={design} cols={2} rows={2} />
              <figcaption className="text-sm text-tinta/75">
                {TILE_ART[design].label}
                <span className="text-tinta/55">, padrão {TILE_ART[design].pattern}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div>
        <BoardSubheading note="Uma fileira que separa seções. Preenche a largura com ladrilhos inteiros: 60 px ou mais no celular, 84 px ou mais no desktop.">
          Faixa
        </BoardSubheading>
        <div className="flex flex-col gap-8">
          <TileBand design="flor" animate={false} />
          <TileBand design="moldura" animate={false} />
          <TileBand design="onda" row={1} animate={false} />
        </div>
        <Caption className="mt-4">Flor, moldura e onda (linha 1 da roseta), paradas</Caption>
      </div>

      <div className="page-grid gap-y-8">
        <div className="lg:col-span-4">
          <BoardSubheading note="Vários desenhos na mesma grade: cada bloco 2×2 usa um, em sequência. Serve para fundos, placeholders e a abertura.">
            Painel
          </BoardSubheading>
        </div>
        <div className="lg:col-span-8">
          <div className="hidden md:block">
            <TileGrid design={["flor", "estrela", "moldura", "onda"]} cols={8} rows={4} />
            <TileGrid design="trama" cols={8} rows={2} face="nevoa" className="mt-8" />
          </div>
          <div className="md:hidden">
            <TileGrid design={["flor", "estrela", "moldura", "onda"]} cols={4} rows={4} />
            <TileGrid design="trama" cols={4} rows={2} face="nevoa" className="mt-8" />
          </div>
          <Caption className="mt-4">
            Flor, estrela, moldura e onda; abaixo, trama sobre névoa
          </Caption>
        </div>
      </div>

      <div>
        <BoardSubheading note="D & G em linha cobalto. Abaixo de 320 px o traço engrossa (weight) para o fio não sumir.">
          Monograma
        </BoardSubheading>
        <div className="page-grid items-end gap-y-12">
          <figure className="flex flex-col gap-4 lg:col-span-5">
            <Monogram label="D & G" className="max-w-[320px]" />
            <Caption>320 px, weight 1</Caption>
          </figure>
          <figure className="flex flex-col gap-4 lg:col-span-3">
            <Monogram weight={1.6} className="max-w-[200px]" />
            <Caption>200 px, weight 1,6</Caption>
          </figure>
          <figure className="flex flex-col gap-4 lg:col-span-2">
            <Monogram weight={2.2} className="max-w-[120px]" />
            <Caption>120 px, weight 2,2</Caption>
          </figure>
          <figure className="flex flex-col gap-4 lg:col-span-2">
            <div className="grid aspect-square place-items-center bg-cobalto p-5 [--tile-ink:var(--color-branco)]">
              <Monogram weight={2.2} />
            </div>
            <Caption>Sobre cobalto, em branco</Caption>
          </figure>
        </div>
      </div>
    </div>
  );
}
