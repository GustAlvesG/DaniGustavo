import { contrastLevel, contrastRatio, formatRatio } from "@/lib/contrast";
import { cx } from "@/lib/cx";

/** Espelho da paleta de globals.css (PROMPT §4.2). */
const PALETTE = {
  tinta: "#0E1F4D",
  cobalto: "#1F3FAE",
  anil: "#4C6FD8",
  nevoa: "#E6EDFA",
  esmalte: "#FBFCFF",
  branco: "#FFFFFF",
  erro: "#B3261E",
} as const;

type ColorName = keyof typeof PALETTE;

type Swatch = {
  name: ColorName;
  label: string;
  usage: string;
  /** Classe do bloco de cor e do "Aa" de amostra. */
  chip: string;
  ink: string;
  /** Pares de contraste a mostrar: [cor do texto, cor do fundo, rótulo]. */
  pairs: [ColorName, ColorName, string][];
  note?: string;
};

const MAIN: Swatch[] = [
  {
    name: "tinta",
    label: "Tinta",
    usage: "Texto principal e títulos, no lugar do preto.",
    chip: "bg-tinta",
    ink: "text-esmalte",
    pairs: [
      ["tinta", "esmalte", "Sobre esmalte"],
      ["tinta", "branco", "Sobre branco"],
    ],
  },
  {
    name: "cobalto",
    label: "Cobalto",
    usage: "Cor da marca: azulejos, botões, links e foco.",
    chip: "bg-cobalto",
    ink: "text-branco",
    pairs: [
      ["cobalto", "esmalte", "Sobre esmalte"],
      ["cobalto", "branco", "Sobre branco"],
    ],
  },
  {
    name: "anil",
    label: "Anil",
    usage: "Traços secundários, bordas de campo e hover.",
    chip: "bg-anil",
    ink: "text-branco",
    pairs: [
      ["anil", "esmalte", "Sobre esmalte"],
      ["anil", "branco", "Sobre branco"],
    ],
    note: "Só texto ≥ 24 px",
  },
];

const SUPPORT: Swatch[] = [
  {
    name: "nevoa",
    label: "Névoa",
    usage: "Fundos de destaque, placeholders, verso dos ladrilhos.",
    chip: "bg-nevoa",
    ink: "text-tinta",
    pairs: [
      ["tinta", "nevoa", "Tinta sobre ela"],
      ["cobalto", "nevoa", "Cobalto sobre ela"],
    ],
  },
  {
    name: "esmalte",
    label: "Esmalte",
    usage: "Fundo da página: branco frio, nunca creme.",
    chip: "bg-esmalte",
    ink: "text-tinta",
    pairs: [
      ["tinta", "esmalte", "Tinta sobre ela"],
      ["cobalto", "esmalte", "Cobalto sobre ela"],
    ],
  },
  {
    name: "branco",
    label: "Branco",
    usage: "Superfícies sobre o esmalte e texto sobre cobalto.",
    chip: "bg-branco",
    ink: "text-tinta",
    pairs: [
      ["branco", "cobalto", "Sobre cobalto"],
      ["tinta", "branco", "Tinta sobre ela"],
    ],
  },
  {
    name: "erro",
    label: "Erro",
    usage: "Somente mensagens de erro.",
    chip: "bg-erro",
    ink: "text-branco",
    pairs: [
      ["erro", "esmalte", "Sobre esmalte"],
      ["erro", "branco", "Sobre branco"],
    ],
  },
];

function ContrastRow({ fg, bg, label }: { fg: ColorName; bg: ColorName; label: string }) {
  const ratio = contrastRatio(PALETTE[fg], PALETTE[bg]);
  const level = contrastLevel(ratio);
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-nevoa py-2">
      <dt className="text-sm text-tinta/75">{label}</dt>
      <dd className="flex items-baseline gap-2 text-sm tabular-nums">
        <span className="font-medium text-tinta">{formatRatio(ratio)}</span>
        <span
          className={cx(
            "min-w-[5.5em] text-right",
            level === "falha" ? "text-erro" : "text-tinta/70",
          )}
        >
          {level}
        </span>
      </dd>
    </div>
  );
}

function SwatchCard({ swatch, large }: { swatch: Swatch; large?: boolean }) {
  const light = swatch.name === "esmalte" || swatch.name === "branco" || swatch.name === "nevoa";
  return (
    <figure className="flex flex-col">
      <div
        className={cx(
          "relative flex items-end p-5",
          large ? "aspect-[4/3]" : "aspect-[3/2]",
          swatch.chip,
          light && "ring-1 ring-cobalto/20 ring-inset",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "font-display leading-none",
            large ? "text-display-sm" : "text-3xl",
            swatch.ink,
          )}
        >
          Aa
        </span>
        {swatch.note ? (
          <span className="absolute top-4 right-4 bg-branco px-2.5 py-1 text-xs font-medium text-tinta">
            {swatch.note}
          </span>
        ) : null}
      </div>
      <figcaption className="mt-4 flex flex-col">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-lg font-semibold text-tinta">{swatch.label}</span>
          <span className="text-sm tabular-nums text-tinta/75">{PALETTE[swatch.name]}</span>
        </div>
        <code className="mt-0.5 font-mono text-xs text-cobalto">--color-{swatch.name}</code>
        <p className="mt-2 text-sm text-tinta/80">{swatch.usage}</p>
        <dl className="mt-4 flex flex-col border-b border-nevoa">
          {swatch.pairs.map(([fg, bg, label]) => (
            <ContrastRow key={`${fg}-${bg}`} fg={fg} bg={bg} label={label} />
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}

export function Swatches() {
  return (
    <div className="flex flex-col gap-16 lg:gap-20">
      <div className="page-grid gap-y-12">
        {MAIN.map((s) => (
          <div key={s.name} className="lg:col-span-4">
            <SwatchCard swatch={s} large />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-8">
        {SUPPORT.map((s) => (
          <SwatchCard key={s.name} swatch={s} />
        ))}
      </div>
      <p className="max-w-[60ch] text-sm text-tinta/70">
        Razões calculadas pela luminância relativa da WCAG 2.2. AA pede 4,5:1 para texto comum e 3:1
        para texto a partir de 24 px e para bordas de componentes. Quando arredondar passaria de um
        limite, a razão aparece com duas casas.
      </p>
    </div>
  );
}
