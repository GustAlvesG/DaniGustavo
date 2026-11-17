/**
 * Fotos e textos das páginas internas (mesmo esquema de content/home.ts:
 * o arquivo fica em apps/web/public/fotos e aqui vai só o nome).
 */
import type { Foto } from "./home";

export const paginas = {
  /** /padrinhos: a foto no arco, ao lado do título. */
  padrinhos: {
    foto: {
      arquivo: "img_7871.jpg",
      alt: "Dani e Gustavo abraçados, com o sol se pondo atrás",
      posicao: "40% center",
    } satisfies Foto,
  },
  /** Página não encontrada (404). */
  naoEncontrada: {
    foto: {
      arquivo: "img_7977.jpg",
      alt: "Dani e Gustavo pequenos no topo da pedra, com a trilha e as montanhas",
    } satisfies Foto,
    legenda: "Pegamos o caminho errado também.",
  },
};
