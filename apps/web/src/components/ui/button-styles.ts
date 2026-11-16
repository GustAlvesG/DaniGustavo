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
 * Forma: cápsula (o "estádio" dos cartões do casal). O primário é chapado
 * na cor da tinta da superfície (branco no marinho, marinho no relevo), com
 * um fio interno a 3px da borda, como a moldura dupla dos cartões. O fio é
 * um pseudo-elemento (::before), não uma sombra: não recorta o anel de foco
 * e continua nítido em qualquer densidade de tela.
 */
const base = cx(
  "relative isolate inline-flex items-center justify-center gap-2.5",
  "rounded-full font-sans font-medium leading-tight text-center text-balance",
  "select-none touch-manipulation cursor-pointer",
  "transition-[transform,background-color,color,border-color] duration-micro ease-out",
  "active:scale-[0.97] motion-reduce:active:scale-100",
  "disabled:cursor-not-allowed disabled:active:scale-100",
  "aria-disabled:cursor-not-allowed aria-disabled:active:scale-100",
);

const frame = cx(
  "before:pointer-events-none before:absolute before:inset-[3px] before:-z-10",
  "before:rounded-full before:border before:transition-colors before:duration-micro",
);

const variants: Record<ButtonVariant, string> = {
  primary: cx(
    frame,
    "bg-ink text-on-ink before:border-on-ink/30",
    "not-disabled:hover:bg-ink/85 not-disabled:hover:before:border-on-ink/50",
    "disabled:bg-ink/25 disabled:text-ink disabled:before:border-transparent",
  ),
  // Sem o fio interno: com ele, o contorno lia como campo de texto.
  secondary: cx(
    "border-[1.5px] border-ink bg-transparent text-ink",
    "not-disabled:hover:bg-ink/10",
    "disabled:border-ink/30 disabled:bg-transparent disabled:text-ink-soft",
  ),
  quiet: cx(
    "text-ink underline decoration-accent decoration-1 underline-offset-[0.28em]",
    "transition-[transform,text-decoration-thickness,color]",
    "not-disabled:hover:decoration-2 disabled:text-ink-soft disabled:no-underline",
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
