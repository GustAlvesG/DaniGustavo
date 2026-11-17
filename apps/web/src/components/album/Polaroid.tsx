import type { ReactNode } from "react";
import type { Foto } from "@/content/home";
import { cx } from "@/lib/cx";
import { FotoImg } from "./FotoImg";

export type PolaroidProps = {
  foto: Foto;
  sizes: string;
  /** Linha pequena em caixa alta (ex.: o ano). */
  sobre?: string;
  /** Legenda em itálico. */
  legenda?: ReactNode;
  /**
   * "retrato": recorte 4:5 (padrão). "natural": a foto inteira, na
   * proporção do arquivo (álbum e galeria).
   */
  formato?: "retrato" | "natural";
  /** Inclinação (r1 a r6) e revelação (assenta, assenta-d...). */
  className?: string;
  as?: "figure" | "div";
};

/** Foto colada no álbum: moldura branca de polaroid, fita washi e legenda. */
export function Polaroid({
  foto,
  sizes,
  sobre,
  legenda,
  formato = "retrato",
  className,
  as: Tag = "figure",
}: PolaroidProps) {
  const Legenda = Tag === "figure" ? "figcaption" : "div";
  return (
    <Tag className={cx("polaroid", className)}>
      {formato === "retrato" ? (
        <div className="polaroid-foto">
          <FotoImg foto={foto} sizes={sizes} fill />
        </div>
      ) : (
        <FotoImg foto={foto} sizes={sizes} className="bg-[#e8e4da]" />
      )}
      {sobre || legenda ? (
        <Legenda className="legenda">
          {sobre ? <b>{sobre}</b> : null}
          {legenda ? <span>{legenda}</span> : null}
        </Legenda>
      ) : null}
    </Tag>
  );
}
