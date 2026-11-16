import { Tile, TILE_ART, TILE_DESIGNS, TileBand, TileGrid } from "@/components/tiles";
import type { TileRotation } from "@/components/tiles";
import { BoardSubheading, Caption } from "./section";

const ROTATIONS: TileRotation[] = [0, 90, 180, 270];

export function TileBoard() {
  return (
    <div className="flex flex-col gap-24 lg:gap-32">
      <div>
        <BoardSubheading note="Nove desenhos próprios, cada um nas quatro rotações. Linha branca no marinho; no relevo, a mesma linha vira royal. A rotação vai na geometria do SVG, não em CSS.">
          Desenhos e rotações
        </BoardSubheading>
        <ul className="flex flex-col">
          {TILE_DESIGNS.map((design) => {
            const art = TILE_ART[design];
            return (
              <li
                key={design}
                className="page-grid gap-y-5 border-t border-line-soft py-6 lg:items-center lg:py-8"
              >
                <div className="flex flex-col gap-1 lg:col-span-4">
                  <span className="font-display text-2xl text-ink">{art.label}</span>
                  <code className="font-mono text-xs text-accent">design=&quot;{design}&quot;</code>
                  <p className="mt-1 max-w-[42ch] text-sm text-ink-soft">{art.idea}</p>
                </div>
                <div className="grid grid-cols-4 gap-3 lg:col-span-7 lg:col-start-6 lg:gap-5">
                  {ROTATIONS.map((r) => (
                    <figure key={r} className="flex flex-col gap-2">
                      <Tile design={design} rotate={r} className="ring-1 ring-line-soft" />
                      <figcaption className="text-xs tabular-nums text-ink-soft">{r}°</figcaption>
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
              <figcaption className="text-sm text-ink-soft">
                {TILE_ART[design].label}
                <span className="text-ink-soft">, padrão {TILE_ART[design].pattern}</span>
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
            <div className="surface-relevo mt-8">
              <TileGrid design="rosa" cols={8} rows={2} />
            </div>
          </div>
          <div className="md:hidden">
            <TileGrid design={["flor", "estrela", "moldura", "onda"]} cols={4} rows={4} />
            <div className="surface-relevo mt-8">
              <TileGrid design="rosa" cols={4} rows={2} />
            </div>
          </div>
          <Caption className="mt-4">
            Flor, estrela, moldura e onda; abaixo, rosa sobre o relevo
          </Caption>
        </div>
      </div>
    </div>
  );
}
