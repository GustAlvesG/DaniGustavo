import type { FontId, ResolvedTheme } from "@casamento/shared";
import {
  Cormorant_Garamond,
  Dancing_Script,
  DM_Serif_Display,
  Fraunces,
  Great_Vibes,
  Inter,
  Jost,
  Nunito_Sans,
  Outfit,
  Pinyon_Script,
  Playfair_Display,
} from "next/font/google";
import { themeFontIds } from "./vars";

/*
 * Fontes da lista curada (FONTS em @casamento/shared), baixadas no build pelo next/font e
 * servidas pelo próprio site. Só as do tema do evento recebem a classe que define a variável
 * (`themeFontClasses`): as outras ficam só como @font-face sem uso, que o navegador não baixa.
 * Só as três do Álbum fazem preload (é o tema do evento 1); as demais carregam sob demanda.
 */
/* Opções literais: o next/font as lê em tempo de compilação. */
const f_cormorant_garamond = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant-garamond",
});
const f_jost = Jost({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["400", "500"],
  variable: "--font-jost",
});
const f_pinyon_script = Pinyon_Script({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: "400",
  variable: "--font-pinyon-script",
});
const f_playfair_display = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  variable: "--font-playfair-display",
});
const f_fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});
const f_dm_serif_display = DM_Serif_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-dm-serif-display",
});
const f_outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-outfit",
});
const f_nunito_sans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-nunito-sans",
});
const f_inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-inter",
});
const f_great_vibes = Great_Vibes({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-great-vibes",
});
const f_dancing_script = Dancing_Script({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-dancing-script",
});

const loaded: Record<FontId, { variable: string }> = {
  "cormorant-garamond": f_cormorant_garamond,
  jost: f_jost,
  "pinyon-script": f_pinyon_script,
  "playfair-display": f_playfair_display,
  fraunces: f_fraunces,
  "dm-serif-display": f_dm_serif_display,
  outfit: f_outfit,
  "nunito-sans": f_nunito_sans,
  inter: f_inter,
  "great-vibes": f_great_vibes,
  "dancing-script": f_dancing_script,
};

/** Classes (variáveis do next/font) das fontes que o tema usa, para o <html>. */
export function themeFontClasses(theme: ResolvedTheme): string {
  return themeFontIds(theme)
    .map((id) => loaded[id].variable)
    .join(" ");
}
