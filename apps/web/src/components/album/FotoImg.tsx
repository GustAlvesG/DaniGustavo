import Image from "next/image";
import type { Foto } from "@/content/home";
import { foto as fotoInfo } from "@/lib/fotos";
import { cx } from "@/lib/cx";

export type FotoImgProps = {
  foto: Foto;
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
 * Foto de `public/fotos` pelo nome (content/home.ts). O `next/image` gera
 * versões menores (WebP/AVIF) no tamanho de cada tela e carrega só perto da
 * vista; largura e altura vêm do próprio arquivo.
 */
export function FotoImg({ foto, sizes, fill, preload, className }: FotoImgProps) {
  const info = fotoInfo(foto.arquivo);
  const style = foto.posicao ? { objectPosition: foto.posicao } : undefined;
  if (fill) {
    return (
      <Image
        src={info.src}
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
      src={info.src}
      alt={foto.alt}
      width={info.width}
      height={info.height}
      sizes={sizes}
      preload={preload}
      className={cx("block h-auto w-full", className)}
      style={style}
    />
  );
}
