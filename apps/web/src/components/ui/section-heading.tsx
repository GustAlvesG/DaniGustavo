import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type SectionHeadingProps = {
  children: ReactNode;
  /** Nível do título. h1 e h2 usam o título grande do álbum; h3, um degrau menor. */
  as?: "h1" | "h2" | "h3";
  /** Rótulo pequeno em caixa alta acima do título (ex.: "Confirmação"). */
  rotulo?: string;
  /** Frase de apoio abaixo do título. */
  lead?: ReactNode;
  /** id do título, para `aria-labelledby` na <section>. */
  id?: string;
  className?: string;
};

/**
 * Título das páginas internas, no estilo das seções da home: rótulo com fio,
 * título em Cormorant (use <em> para a palavra em itálico azul) e frase de
 * apoio em tom suave.
 */
export function SectionHeading({
  children,
  as = "h2",
  rotulo,
  lead,
  id,
  className,
}: SectionHeadingProps) {
  const Tag = as;
  return (
    <div className={cx("flex flex-col", className)}>
      {rotulo ? (
        <div className="rotulo">
          <i />
          {rotulo}
        </div>
      ) : null}
      <Tag id={id} className={cx("titulo", as === "h3" && "text-display-sm!")}>
        {children}
      </Tag>
      {lead ? <p className="lead max-w-[44ch]">{lead}</p> : null}
    </div>
  );
}
