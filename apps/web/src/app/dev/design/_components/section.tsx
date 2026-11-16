import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Uma seção da prancha: filete cobalto no topo, título Bodoni à esquerda e
 * um texto curto que explica o que está em revisão.
 */
export function BoardSection({
  id,
  title,
  lead,
  children,
  className,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-titulo`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx("scroll-mt-20 py-20 lg:scroll-mt-24 lg:py-32", className)}
    >
      <div className="page-grid gap-y-6 border-t border-cobalto/30 pt-8 lg:pt-10">
        <h2 id={headingId} className="font-display text-display-md text-tinta lg:col-span-7">
          {title}
        </h2>
        {lead ? (
          <p className="max-w-[44ch] text-lg text-tinta/80 lg:col-span-4 lg:col-start-9 lg:self-end">
            {lead}
          </p>
        ) : null}
      </div>
      <div className="mt-14 lg:mt-20">{children}</div>
    </section>
  );
}

/** Subtítulo dentro de uma seção (h3), em Bodoni menor. */
export function BoardSubheading({
  children,
  note,
  className,
}: {
  children: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-8 flex flex-col gap-2 lg:mb-10", className)}>
      <h3 className="font-display text-3xl text-tinta">{children}</h3>
      {note ? <p className="max-w-[60ch] text-base text-tinta/75">{note}</p> : null}
    </div>
  );
}

/** Legenda pequena (estado, tamanho, token). Figtree, caixa de frase. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-sm text-tinta/70", className)}>{children}</p>;
}
