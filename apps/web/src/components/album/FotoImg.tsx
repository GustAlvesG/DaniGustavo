import Image from "next/image";
import type { Photo } from "@casamento/shared";
import { cx } from "@/lib/cx";

/** O que a foto precisa para aparecer: URL, tamanho, alt e posição do corte. */
export type FotoSrc = Pick<Photo, "src" | "width" | "height" | "alt" | "position">;

export type FotoImgProps = {
  foto: FotoSrc;
  /** Larguras em que a foto aparece (ajuda o navegador a baixar o tamanho certo). */
  sizes: string;
  /**
   * `fill`: a foto cobre o contêiner (que precisa de `position: relative` e
   * tamanho próprio, ex.: aspect-ratio). Sem ele, a foto mantém a proporção
   * do arquivo e ocupa a largura disponível.
   */
  fill?: boolean;
  /** Foto acima da dobra (hero): baixa antes e sem lazy. */
  preload?: boolean;
  className?: string;
};

/**
 * Foto do evento (`SiteContent`: `/uploads/<evento>/...`, repassado à API). O `next/image`
 * gera versões menores (WebP/AVIF) no tamanho de cada tela e carrega só perto da vista;
 * largura e altura vêm da API.
 */
export function FotoImg({ foto, sizes, fill, preload, className }: FotoImgProps) {
  const style = foto.position ? { objectPosition: foto.position } : undefined;
  if (fill) {
    return (
      <Image
        src={foto.src}
        alt={foto.alt}
        fill
        sizes={sizes}
        preload={preload}
        className={cx("object-cover", className)}
        style={style}
      />
    );
  }
  return (
    <Image
      src={foto.src}
      alt={foto.alt}
      width={foto.width}
      height={foto.height}
      sizes={sizes}
      preload={preload}
      className={cx("block h-auto w-full", className)}
      style={style}
    />
  );
}
