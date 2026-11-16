import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type SectionHeadingProps = {
  children: ReactNode;
  /** Nível do título. h2 (padrão) usa display-md; h3 usa display-sm. */
  as?: "h1" | "h2" | "h3";
  /** Frase curta em Figtree abaixo do título. */
  lead?: ReactNode;
  /** id do título, para `aria-labelledby` na <section>. */
  id?: string;
  className?: string;
};

const sizeFor = {
  h1: "text-display-lg",
  h2: "text-display-md",
  h3: "text-display-sm",
} as const;

/**
 * Título de seção: Bodoni grande, alinhado à esquerda, sem rótulo acima.
 * A hierarquia vem só do tamanho; nada de palavra destacada.
 */
export function SectionHeading({ children, as = "h2", lead, id, className }: SectionHeadingProps) {
  const Tag = as;
  return (
    <div className={cx("flex flex-col gap-5 lg:gap-7", className)}>
      <Tag id={id} className={cx("font-display text-ink", sizeFor[as])}>
        {children}
      </Tag>
      {lead ? <p className="max-w-[44ch] text-lg text-ink-soft">{lead}</p> : null}
    </div>
  );
}
