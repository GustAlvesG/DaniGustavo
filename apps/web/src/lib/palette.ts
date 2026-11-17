/**
 * Espelho da paleta de globals.css (design "Álbum"), para os testes de
 * contraste. Mudou uma cor lá, mude aqui: `palette.test.ts` confere cada par
 * de texto e fundo (WCAG 2.2 AA).
 */

export const PALETTE = {
  papel: "#FAF7F1",
  areia: "#F1EEE6",
  branco: "#FFFFFF",
  tinta: "#1B2A4A",
  marinho: "#14213D",
  enfase: "#2D4675",
  suave: "#46557A",
  serenity: "#92A8D1",
  claro: "#BBD0EC",
  nevoa: "#D3DDED",
  erro: "#8A1F2B",
  coral: "#FFB3A7",
} as const;

export type PaletteName = keyof typeof PALETTE;

/** Papel de um par: texto comum (4,5:1), texto grande (3:1) ou elemento de interface (3:1). */
export type PairKind = "texto" | "texto grande" | "interface";

export type ContrastPair = { fg: PaletteName; bg: PaletteName; role: string; kind: PairKind };

/** Todos os pares de cor que o site usa, por superfície. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  // Papel, areia e branco (fundo dominante, seções alternadas, cartões)
  ...(["papel", "areia", "branco"] as const).flatMap((bg): ContrastPair[] => [
    { fg: "tinta", bg, role: "Texto principal", kind: "texto" },
    { fg: "suave", bg, role: "Texto secundário, rótulos", kind: "texto" },
    { fg: "enfase", bg, role: "Palavra em itálico, links, foco", kind: "texto" },
    { fg: "erro", bg, role: "Erro", kind: "texto" },
    { fg: "suave", bg, role: "Borda de campo", kind: "interface" },
  ]),
  { fg: "branco", bg: "tinta", role: "Botão primário (branco sobre tinta)", kind: "texto" },
  // Marinho (menu, contagem, confirmação, rodapé)
  { fg: "branco", bg: "marinho", role: "Texto principal", kind: "texto" },
  { fg: "nevoa", bg: "marinho", role: "Texto secundário, rótulos", kind: "texto" },
  { fg: "claro", bg: "marinho", role: "Palavra em itálico, segundos", kind: "texto" },
  { fg: "coral", bg: "marinho", role: "Erro", kind: "texto" },
  { fg: "serenity", bg: "marinho", role: "Anel de foco, borda de campo", kind: "interface" },
  { fg: "marinho", bg: "branco", role: "Botão primário (marinho sobre branco)", kind: "texto" },
];

/** Razão mínima da WCAG 2.2 AA para cada papel. */
export function minimumRatio(kind: PairKind): number {
  return kind === "texto" ? 4.5 : 3;
}
