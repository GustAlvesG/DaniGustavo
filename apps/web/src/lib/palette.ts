/**
 * Paleta do design "Álbum" (tema `album`, paleta `marinho`) e os pares de contraste, que agora
 * moram no registro de temas de `@casamento/shared` (themes.ts). `palette.test.ts` confere
 * que globals.css usa os mesmos valores.
 * TODO(fase2-C): globals.css passa a receber as cores do tema escolhido pelo evento.
 */
import { ALBUM_MARINHO, type PaletteToken } from "@casamento/shared";

export const PALETTE = ALBUM_MARINHO;
export type PaletteName = PaletteToken;

export { CONTRAST_PAIRS, minimumRatio, type ContrastPair, type PairKind } from "@casamento/shared";
