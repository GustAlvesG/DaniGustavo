import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui";
import { cx } from "@/lib/cx";
import styles from "./board.module.css";
import { BoardSubheading, Caption } from "./section";

const VARIANTS: { variant: ButtonVariant; label: string; text: string; note: string }[] = [
  {
    variant: "primary",
    label: "Primário",
    text: "Confirmar presença",
    note: "Uma ação principal por tela. Cobalto chapado com filete interno, como a moldura de um azulejo.",
  },
  {
    variant: "secondary",
    label: "Secundário",
    text: "Ver lista de presentes",
    note: "Ações de apoio ao lado do primário. Contorno cobalto, névoa no hover.",
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
          <div className="hidden grid-cols-[10rem_repeat(4,minmax(0,1fr))] gap-x-8 border-b border-nevoa pb-3 lg:grid">
            <span />
            {STATES.map((s) => (
              <Caption key={s}>{s}</Caption>
            ))}
          </div>
          {SIZES.map(({ size, label }) => (
            <div
              key={size}
              className="grid grid-cols-1 gap-x-8 gap-y-5 border-b border-nevoa py-7 sm:grid-cols-2 lg:grid-cols-[10rem_repeat(4,minmax(0,1fr))] lg:items-center"
            >
              <p className="text-sm font-medium text-tinta sm:col-span-2 lg:col-span-1">
                {label}
                <code className="mt-0.5 block font-mono text-xs font-normal text-cobalto">
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
          <BoardSubheading note="Sobre cobalto, o anel de foco fica branco (utilitário focus-on-dark). Ainda não há variante de botão para fundo escuro: o secundário aqui leva um ajuste local só desta prancha.">
            Sobre fundo escuro
          </BoardSubheading>
        </div>
        <div className="focus-on-dark grid grid-cols-1 gap-8 bg-cobalto p-8 sm:grid-cols-2 lg:col-span-7 lg:p-12">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-branco/85">Normal</p>
            <div>
              <Button variant="secondary" className={styles.onDarkButton}>
                Presentear
              </Button>
            </div>
          </div>
          <div className={cx("flex flex-col gap-3", styles.forceFocusDark)}>
            <p className="text-sm text-branco/85">Foco</p>
            <div>
              <Button variant="secondary" className={styles.onDarkButton} data-force-focus="">
                Presentear
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
