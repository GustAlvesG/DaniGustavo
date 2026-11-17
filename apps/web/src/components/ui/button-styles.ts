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
 * Botão do álbum (Proposta C): cápsula chapada na cor da tinta da
 * superfície (marinho no papel, branco no marinho), com o texto em Jost
 * caixa alta e espaçado. O secundário é só o contorno fino.
 */
const base = cx(
  "relative isolate inline-flex items-center justify-center gap-2.5",
  "rounded-full font-sans font-normal uppercase leading-tight text-center text-balance",
  "text-[0.76rem] tracking-[0.2em] no-underline",
  "select-none touch-manipulation cursor-pointer",
  "transition-[transform,background-color,color,box-shadow] duration-micro ease-out",
  "active:scale-[0.97] motion-reduce:active:scale-100",
  "disabled:cursor-not-allowed disabled:active:scale-100",
  "aria-disabled:cursor-not-allowed aria-disabled:active:scale-100",
);

const variants: Record<ButtonVariant, string> = {
  primary: cx(
    "bg-ink text-on-ink",
    "not-disabled:hover:bg-ink/85",
    "disabled:bg-ink/25 disabled:text-ink",
  ),
  secondary: cx(
    "bg-transparent text-ink shadow-[inset_0_0_0_1px_var(--ink)]",
    "not-disabled:hover:bg-ink not-disabled:hover:text-on-ink",
    "disabled:text-ink-soft disabled:shadow-[inset_0_0_0_1px_var(--line-soft)]",
  ),
  quiet: cx(
    "text-ink underline decoration-accent decoration-1 underline-offset-[0.4em]",
    "transition-[transform,text-decoration-thickness,color]",
    "not-disabled:hover:decoration-2 disabled:text-ink-soft disabled:no-underline",
  ),
};

const sizes: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: "min-h-12 px-6 py-3", lg: "min-h-14 px-8 py-3.5" },
  secondary: { md: "min-h-12 px-6 py-3", lg: "min-h-14 px-8 py-3.5" },
  quiet: { md: "min-h-11 px-1", lg: "min-h-12 px-1" },
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
