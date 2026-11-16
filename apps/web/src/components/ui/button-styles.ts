import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "quiet";
export type ButtonSize = "md" | "lg";

export type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa toda a largura do contêiner (útil no celular). */
  block?: boolean;
  className?: string;
};

/*
 * Forma: retângulo de quina viva (raio 2px). O primário tem um filete interno a 4px da
 * borda, como a moldura pintada que contorna um azulejo. O filete é um
 * pseudo-elemento (::before), não uma sombra: não recorta o anel de foco
 * (clip-path recortaria) e continua nítido em qualquer densidade de tela.
 */
const base = cx(
  "relative isolate inline-flex items-center justify-center gap-2.5",
  "rounded-[2px] font-sans font-medium leading-tight text-center text-balance",
  "select-none touch-manipulation cursor-pointer",
  "transition-[transform,background-color,color,border-color] duration-micro ease-out",
  "active:scale-[0.97] motion-reduce:active:scale-100",
  "disabled:cursor-not-allowed disabled:active:scale-100",
  "aria-disabled:cursor-not-allowed aria-disabled:active:scale-100",
);

const frame = cx(
  "before:pointer-events-none before:absolute before:inset-1 before:-z-10",
  "before:rounded-[1px] before:border before:transition-colors before:duration-micro",
);

const variants: Record<ButtonVariant, string> = {
  primary: cx(
    frame,
    "bg-cobalto text-branco before:border-branco/35",
    "not-disabled:hover:bg-tinta not-disabled:hover:before:border-branco/55",
    "disabled:bg-nevoa disabled:text-tinta/55 disabled:before:border-tinta/15",
  ),
  // Sem o filete interno: com ele, o contorno lia como campo de texto.
  secondary: cx(
    "border-[1.5px] border-cobalto bg-transparent text-cobalto",
    "not-disabled:hover:bg-nevoa",
    "disabled:border-tinta/25 disabled:bg-transparent disabled:text-tinta/50",
  ),
  quiet: cx(
    "text-cobalto underline decoration-1 underline-offset-[0.28em]",
    "transition-[transform,text-decoration-thickness,color]",
    "not-disabled:hover:decoration-2 not-disabled:hover:text-tinta disabled:text-tinta/50 disabled:no-underline",
  ),
};

const sizes: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: "min-h-12 px-6 py-2.5 text-base", lg: "min-h-14 px-8 py-3 text-base" },
  secondary: { md: "min-h-12 px-6 py-2.5 text-base", lg: "min-h-14 px-8 py-3 text-base" },
  quiet: { md: "min-h-11 px-1 text-base", lg: "min-h-12 px-1 text-lg" },
};

/** Classes do botão, compartilhadas entre <Button> e <ButtonLink>. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cx(base, variants[variant], sizes[variant][size], block && "w-full", className);
}
