import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Monogram, TileBand } from "@/components/tiles";
import { BandReplay } from "./_components/band-replay";
import { ButtonBoard } from "./_components/button-board";
import { CountdownDemo } from "./_components/countdown-demo";
import { DrawReplay } from "./_components/draw-replay";
import { FieldBoard } from "./_components/field-board";
import { CurvesBoard, DurationsBoard } from "./_components/motion-tokens";
import { Hero } from "@/components/hero/Hero";
import { heroPlaceholder } from "@/content/placeholder";
import { OpeningReplay } from "./_components/opening-replay";
import { BoardSection, BoardSubheading } from "./_components/section";
import { Swatches } from "./_components/swatches";
import { TileBoard } from "./_components/tile-board";
import { TypeBoard } from "./_components/type-board";

export const metadata: Metadata = {
  title: "Prancha de design",
  robots: { index: false, follow: false },
};

const INDEX = [
  { id: "cores", label: "Cores" },
  { id: "movimento", label: "Curvas e durações" },
  { id: "tipografia", label: "Tipografia" },
  { id: "azulejos", label: "Azulejos" },
  { id: "botoes", label: "Botões" },
  { id: "campos", label: "Campos" },
  { id: "contagem", label: "Contagem" },
  { id: "animacoes", label: "Animações" },
  { id: "abertura", label: "Abertura" },
  { id: "hero", label: "Hero" },
];

/**
 * /dev/design: prancha de revisão do design system (PROMPT §4.8).
 * Só existe em desenvolvimento; no build de produção vira 404.
 */
export default function DesignBoardPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="flex-1 pb-24">
      <TileBand design="moldura" animate={false} />

      <header className="page-wrap">
        <div className="page-grid gap-y-12 pt-16 pb-16 lg:items-end lg:pt-28 lg:pb-24">
          <div className="flex flex-col gap-8 lg:col-span-7">
            <h1 className="font-display text-display-lg text-tinta">Prancha de design</h1>
            <p className="max-w-[46ch] text-lg text-tinta/80">
              Cores, movimento, tipografia, azulejos e componentes do site de Dani & Gustavo,
              reunidos num lugar só para revisão. Cada animação tem botão para repetir. Esta página
              só existe em desenvolvimento.
            </p>
          </div>
          <div className="hidden lg:col-span-4 lg:col-start-9 lg:block">
            <Monogram label="D & G" weight={1.2} />
          </div>
        </div>
      </header>

      <nav
        aria-label="Seções da prancha"
        className="sticky top-0 z-20 border-y border-cobalto/20 bg-esmalte"
      >
        <ul className="page-wrap flex gap-x-6 overflow-x-auto [scrollbar-width:none] lg:gap-x-9">
          {INDEX.map((item) => (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                className="flex min-h-12 items-center text-sm font-medium whitespace-nowrap text-tinta/75 underline-offset-[0.3em] transition-colors duration-micro ease-out hover:text-cobalto hover:underline"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="page-wrap">
        <BoardSection
          id="cores"
          title="Cores"
          lead="Tinta cobalto sobre esmalte branco, como no azulejo. Sete tokens, sem degradê e sem sombra cinza: a profundidade vem da névoa sob o branco."
        >
          <Swatches />
        </BoardSection>

        <BoardSection
          id="movimento"
          title="Curvas e durações"
          lead="Duas curvas e três tempos para tudo que se move. O quadrado cobalto mostra cada um na prática."
        >
          <div className="flex flex-col gap-24 lg:gap-32">
            <div>
              <BoardSubheading note="Progresso no eixo vertical, tempo no horizontal. A diagonal clara é a referência linear; os pontos vazados são as alças da curva.">
                Curvas
              </BoardSubheading>
              <CurvesBoard />
            </div>
            <div>
              <BoardSubheading note="Springs do Motion seguem os mesmos tempos, com bounce de no máximo 0,2.">
                Durações
              </BoardSubheading>
              <DurationsBoard />
            </div>
          </div>
        </BoardSection>

        <BoardSection
          id="tipografia"
          title="Tipografia"
          lead="Bodoni Moda em tamanho de cartaz para nomes, títulos e números; Figtree para ler e para a interface."
        >
          <TypeBoard />
        </BoardSection>
      </div>

      <TileBand design="flor" animate={false} />

      <div className="page-wrap">
        <BoardSection
          id="azulejos"
          title="Azulejos"
          lead="O elemento memorável do site. Ladrilhos de linha que se montam em faixas e painéis, viram e se desenham."
        >
          <TileBoard />
        </BoardSection>
      </div>

      <TileBand design="onda" animate={false} />

      <div className="page-wrap">
        <BoardSection
          id="botoes"
          title="Botões"
          lead="Quina viva e um filete interno, como a moldura pintada de um azulejo. Na pressão, encolhem para 97%."
        >
          <ButtonBoard />
        </BoardSection>

        <BoardSection
          id="campos"
          title="Campos"
          lead="Controles nativos redesenhados: rótulo acima, superfície branca sobre o esmalte, erro em vermelho só quando há erro."
        >
          <FieldBoard />
        </BoardSection>

        <BoardSection
          id="contagem"
          title="Contagem"
          lead="Dias, horas e minutos até 15 de maio de 2027, sem segundos. O relógio aqui é controlado: avance uma hora para ver os dígitos rolarem."
        >
          <CountdownDemo details />
        </BoardSection>
      </div>

      <TileBand design="laco" animate={false} />

      <div className="page-wrap">
        <BoardSection
          id="animacoes"
          title="Animações"
          lead="Cada movimento do site com um botão para repetir. Com movimento reduzido, as viradas viram crossfade e os traços aparecem sem desenho."
        >
          <div className="flex flex-col gap-24 lg:gap-32">
            <div>
              <BoardSubheading note="Os ladrilhos viram um a um quando a faixa entra na tela, uma vez só. É a única animação de entrada fora da abertura.">
                Virada da faixa
              </BoardSubheading>
              <BandReplay />
            </div>
            <div>
              <BoardSubheading note="Os traços se desenham na ordem dos paths, em linha cobalto; pontos e aguada entram no fim.">
                Desenho do azulejo
              </BoardSubheading>
              <DrawReplay />
            </div>
            <div>
              <BoardSubheading note="O dígito que muda sobe e sai; o novo entra de baixo, em 320 ms com --ease-out.">
                Rolagem da contagem
              </BoardSubheading>
              <CountdownDemo sizes={["sm"]} />
            </div>
          </div>
        </BoardSection>

        <BoardSection
          id="abertura"
          title="Abertura"
          lead="A assinatura do site: os ladrilhos viram em onda, formam o monograma, que se desenha, e a grade se abre como duas folhas de porta."
        >
          <OpeningReplay />
        </BoardSection>

        <BoardSection
          id="hero"
          title="Hero"
          lead="A primeira tela da home, com os nomes em tamanho de cartaz."
        >
          <div className="-mx-[var(--gutter)] border-y border-nevoa bg-esmalte">
            <Hero {...heroPlaceholder} headingLevel="h2" />
          </div>
        </BoardSection>
      </div>

      <TileBand design="moldura" row={1} animate={false} />
    </main>
  );
}
