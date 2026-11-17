import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Enfase } from "./Enfase";

export type CabecalhoProps = {
  /** Rótulo pequeno (ex.: "Nossa história"). */
  rotulo: string;
  /** Número da página do álbum ("Página 2 · ..."); sem ele, só o rótulo. */
  pagina?: number;
  /** Título; *palavra* sai em itálico. */
  titulo: string;
  lead?: ReactNode;
  /** id do título, para `aria-labelledby` na <section>. */
  id?: string;
  as?: "h1" | "h2";
  /** "centro" (padrão, seções da home) ou "esquerda" (ao lado de uma foto). */
  alinhamento?: "centro" | "esquerda";
  /** Fio dos dois lados do rótulo (padrão) ou só à esquerda. */
  fios?: "dois" | "um";
  /** Revelação na rolagem (padrão: sim). */
  revelar?: boolean;
  className?: string;
};

/**
 * Cabeçalho de seção do álbum: rótulo em caixa alta com fios, título em
 * Cormorant com uma palavra em itálico azul e uma frase de apoio. Cada
 * linha sobe com a rolagem, uma depois da outra (.rv .d1 .d2).
 */
export function Cabecalho({
  rotulo,
  pagina,
  titulo,
  lead,
  id,
  as: Tag = "h2",
  alinhamento = "centro",
  fios = "dois",
  revelar = true,
  className,
}: CabecalhoProps) {
  const rv = (atraso?: string) => (revelar ? cx("rv", atraso) : undefined);
  return (
    <div className={cx(alinhamento === "centro" && "mx-auto max-w-[640px] text-center", className)}>
      <div className={cx("rotulo", rv())}>
        <i />
        {pagina ? `Página ${pagina} · ${rotulo}` : rotulo}
        {fios === "dois" ? <i /> : null}
      </div>
      <Tag id={id} className={cx("titulo", rv("d1"))}>
        <Enfase texto={titulo} />
      </Tag>
      {lead ? <p className={cx("lead", rv("d2"))}>{lead}</p> : null}
    </div>
  );
}
