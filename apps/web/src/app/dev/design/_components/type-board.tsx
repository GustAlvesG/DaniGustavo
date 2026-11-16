import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { BoardSubheading, Caption } from "./section";

const DISPLAY = [
  {
    token: "text-display-xl",
    range: "70 → 232 px",
    clamp: "clamp(4.25rem, 18vw, 14.5rem)",
    usage: "Nomes no hero",
    sample: (
      <>
        <span className="block">Dani</span>
        <span className="block">&amp; Gustavo</span>
      </>
    ),
    // Duas linhas como no hero; no celular a coluna tem margens extras, então
    // o tamanho cede um pouco para "& Gustavo" não quebrar.
    className: "text-display-xl text-nowrap max-lg:text-[min(18vw,calc((100vw_-_4rem)_/_4.5))]",
  },
  {
    token: "text-display-lg",
    range: "64 → 160 px",
    clamp: "clamp(4rem, 1.4rem + 10vw, 10rem)",
    usage: "Frases de impacto e a data",
    sample: "15 de maio",
    className: "text-display-lg",
  },
  {
    token: "text-display-md",
    range: "48 → 104 px",
    clamp: "clamp(3rem, 1.6rem + 5.4vw, 6.5rem)",
    usage: "Títulos de seção (h2)",
    sample: "Nossa história",
    className: "text-display-md",
  },
  {
    token: "text-display-sm",
    range: "40 → 64 px",
    clamp: "clamp(2.5rem, 1.9rem + 2.4vw, 4rem)",
    usage: "Subtítulos (h3) e a contagem",
    sample: "Lista de presentes",
    className: "text-display-sm",
  },
];

/** Corpo: 17 px no celular, 18 px a partir de 1024 px; razão 1,25. */
const px = (base: number, factor: number) =>
  (Math.round(base * factor * 10) / 10).toLocaleString("pt-BR");

const TEXT = [
  { token: "text-3xl", factor: 2.44140625, lh: "1,1", sample: "Confirme sua presença" },
  { token: "text-2xl", factor: 1.953125, lh: "1,2", sample: "Cerimônia e recepção" },
  { token: "text-xl", factor: 1.5625, lh: "1,3", sample: "Um sábado de maio, perto do mar" },
  {
    token: "text-lg",
    factor: 1.25,
    lh: "1,45",
    sample: "Vamos adorar ter você com a gente nesse dia.",
  },
  {
    token: "text-base",
    factor: 1,
    lh: "1,6",
    sample:
      "A cerimônia começa às 16h. Chegue com calma: haverá água fresca, sombra e lugar para todos.",
  },
  { token: "text-sm", factor: 0.8, lh: "1,5", sample: "Responda até 15 de abril, por favor." },
  {
    token: "text-xs",
    fixed: "13 px",
    lh: "1,45",
    sample: "Valores em reais, com taxas incluídas.",
  },
] as const;

function Meta({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-sm text-ink-soft lg:col-span-3">
      {children}
    </div>
  );
}

export function TypeBoard() {
  return (
    <div className="flex flex-col gap-24 lg:gap-32">
      <div>
        <BoardSubheading note="Bodoni Moda variável, com o corte óptico (opsz) acompanhando o tamanho. Entrelinha 0,9 e tracking negativo já vêm no token.">
          Display em Bodoni Moda
        </BoardSubheading>
        <ul className="flex flex-col">
          {DISPLAY.map((d) => (
            <li key={d.token} className="page-grid gap-y-5 border-t border-line-soft py-8 lg:py-10">
              <Meta>
                <code className="font-mono text-sm text-accent">{d.token}</code>
                <span className="tabular-nums">{d.range}</span>
                <span className="font-mono text-xs break-all text-ink-soft">{d.clamp}</span>
                <span className="mt-1">{d.usage}</span>
              </Meta>
              <p
                className={cx(
                  "min-w-0 font-display text-ink lg:col-span-9 lg:col-start-4",
                  d.className,
                )}
              >
                {d.sample}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <BoardSubheading note="Figtree 400, 500 e 600. Escala modular 1,25 a partir do corpo, que vale 17 px no celular e 18 px a partir de 1024 px.">
          Texto em Figtree
        </BoardSubheading>
        <ul className="flex flex-col">
          {TEXT.map((t) => (
            <li
              key={t.token}
              className="page-grid items-baseline gap-y-3 border-t border-line-soft py-6"
            >
              <Meta>
                <code className="font-mono text-sm text-accent">{t.token}</code>
                <span className="tabular-nums">
                  {"fixed" in t ? t.fixed : `${px(17, t.factor)} → ${px(18, t.factor)} px`},
                  entrelinha {t.lh}
                </span>
              </Meta>
              <p className={cx("measure min-w-0 text-ink lg:col-span-9 lg:col-start-4", t.token)}>
                {t.sample}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="page-grid gap-y-16">
        <div className="lg:col-span-6">
          <BoardSubheading>Pesos</BoardSubheading>
          <ul className="flex flex-col gap-3 text-xl text-ink">
            <li className="font-normal">Regular 400 para o texto corrido</li>
            <li className="font-medium">Médio 500 para rótulos e botões</li>
            <li className="font-semibold">Seminegrito 600 para ênfase curta</li>
          </ul>
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <BoardSubheading>Números tabulares</BoardSubheading>
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <Caption className="mb-3">Proporcionais</Caption>
              <ul className="flex flex-col items-end gap-1 text-xl text-ink">
                <li>R$ 1.111,11</li>
                <li>R$ 980,00</li>
                <li>R$ 75,50</li>
              </ul>
            </div>
            <div>
              <Caption className="mb-3">tabular-nums</Caption>
              <ul className="flex flex-col items-end gap-1 text-xl tabular-nums text-ink">
                <li>R$ 1.111,11</li>
                <li>R$ 980,00</li>
                <li>R$ 75,50</li>
              </ul>
            </div>
          </div>
          <p className="mt-8 font-display text-display-sm tabular-nums text-ink">
            180 dias 04 horas 12 min
          </p>
          <Caption className="mt-2">Bodoni com tabular-nums, como na contagem</Caption>
        </div>
      </div>
    </div>
  );
}
