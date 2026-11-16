import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./board.module.css";
import { BoardSubheading, Caption } from "./section";

const VARIANTS: { variant: ButtonVariant; label: string; text: string; note: string }[] = [
  {
    variant: "primary",
    label: "Primário",
    text: "Confirmar presença",
    note: "Uma ação principal por tela. Cápsula chapada na cor da tinta (branco no marinho, marinho no relevo), com fio interno, como a moldura dupla dos cartões do casal.",
  },
  {
    variant: "secondary",
    label: "Secundário",
    text: "Ver lista de presentes",
    note: "Ações de apoio ao lado do primário. Contorno na cor da tinta; no hover, um véu da mesma cor.",
  },
  {
    variant: "quiet",
    label: "Discreto",
    text: "Voltar",
    note: "Ação de baixo peso, com cara de link sublinhado. Alvo de 44 px mesmo assim.",
  },
];

const SIZES: { size: ButtonSize; label: string }[] = [
  { size: "md", label: "Médio, 48 px" },
  { size: "lg", label: "Grande, 56 px" },
];

const STATES = ["Normal", "Foco", "Desativado", "Carregando"] as const;

function StateCell({
  variant,
  size,
  state,
  text,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  state: (typeof STATES)[number];
  text: string;
}) {
  return (
    <div className={cx("flex flex-col gap-3", state === "Foco" && styles.forceFocus)}>
      <Caption className="lg:hidden">{state}</Caption>
      <div>
        <Button
          variant={variant}
          size={size}
          disabled={state === "Desativado"}
          loading={state === "Carregando"}
          data-force-focus={state === "Foco" ? "" : undefined}
        >
          {text}
        </Button>
      </div>
    </div>
  );
}

export function ButtonBoard() {
  return (
    <div className="flex flex-col gap-20 lg:gap-28">
      {VARIANTS.map((v) => (
        <div key={v.variant}>
          <BoardSubheading note={v.note}>{v.label}</BoardSubheading>
          <div className="hidden grid-cols-[10rem_repeat(4,minmax(0,1fr))] gap-x-8 border-b border-line-soft pb-3 lg:grid">
            <span />
            {STATES.map((s) => (
              <Caption key={s}>{s}</Caption>
            ))}
          </div>
          {SIZES.map(({ size, label }) => (
            <div
              key={size}
              className="grid grid-cols-1 gap-x-8 gap-y-5 border-b border-line-soft py-7 sm:grid-cols-2 lg:grid-cols-[10rem_repeat(4,minmax(0,1fr))] lg:items-center"
            >
              <p className="text-sm font-medium text-ink sm:col-span-2 lg:col-span-1">
                {label}
                <code className="mt-0.5 block font-mono text-xs font-normal text-accent">
                  size=&quot;{size}&quot;
                </code>
              </p>
              {STATES.map((s) => (
                <StateCell key={s} variant={v.variant} size={size} state={s} text={v.text} />
              ))}
            </div>
          ))}
        </div>
      ))}

      <div className="page-grid gap-y-8">
        <div className="lg:col-span-5">
          <BoardSubheading note="Os mesmos botões num cartão de relevo: as cores trocam sozinhas (tokens da superfície). O anel de foco é branco no marinho e royal no claro.">
            Sobre o claro
          </BoardSubheading>
        </div>
        <div className="surface-relevo card-relevo grid grid-cols-1 gap-8 rounded-[2.5rem] p-8 sm:grid-cols-2 lg:col-span-7 lg:p-12">
          {(["primary", "secondary"] as const).map((variant) => (
            <div key={variant} className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <Caption>{variant === "primary" ? "Primário" : "Secundário"}</Caption>
                <div>
                  <Button variant={variant}>Presentear</Button>
                </div>
              </div>
              <div className={cx("flex flex-col gap-3", styles.forceFocus)}>
                <Caption>Foco</Caption>
                <div>
                  <Button variant={variant} data-force-focus="">
                    Presentear
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
