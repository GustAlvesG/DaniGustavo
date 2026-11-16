/**
 * Espelho da paleta de globals.css (identidade do casal, docs/marca), para a
 * prancha /dev/design e para os testes de contraste. Mudou uma cor lá, mude
 * aqui: `palette.test.ts` confere cada par de texto e fundo.
 */

export const PALETTE = {
  marinho: "#15244B",
  noite: "#0F1A38",
  royal: "#0B3270",
  serenity: "#92A8D1",
  celeste: "#BBD0EC",
  relevo: "#F3F9FD",
  branco: "#FFFFFF",
  lousa: "#3D4F7A",
  erro: "#B3261E",
  coral: "#FFB3A7",
} as const;

export type PaletteName = keyof typeof PALETTE;

export type ColorInfo = { name: PaletteName; label: string; usage: string };

export const COLOR_INFO: ColorInfo[] = [
  {
    name: "marinho",
    label: "Marinho",
    usage: "Campo dominante: fundo da página, hero, cartões escuros.",
  },
  {
    name: "royal",
    label: "Royal",
    usage: "Moldura grossa dos cartões; tinta, links e foco sobre o claro.",
  },
  {
    name: "noite",
    label: "Noite",
    usage: "Marinho mais fundo: rodapé, verso e juntas dos ladrilhos.",
  },
  {
    name: "serenity",
    label: "Azul serenity",
    usage: "Destaque sobre o marinho: traços, ênfase, bordas de campo.",
  },
  {
    name: "celeste",
    label: "Azul-claro",
    usage: "Texto secundário sobre o marinho; verso dos ladrilhos claros.",
  },
  {
    name: "relevo",
    label: "Relevo",
    usage: "Superfície clara de detalhe: cartões, formulários, selos.",
  },
  { name: "branco", label: "Branco", usage: "Texto e linha de azulejo sobre o marinho." },
  { name: "lousa", label: "Lousa", usage: "Texto secundário sobre o relevo." },
  { name: "erro", label: "Erro (claro)", usage: "Mensagens de erro sobre o relevo e o branco." },
  { name: "coral", label: "Erro (escuro)", usage: "Mensagens de erro sobre o marinho e o royal." },
];

/** Papel de um par: texto comum (4,5:1), texto grande (3:1) ou elemento de interface (3:1). */
export type PairKind = "texto" | "texto grande" | "interface";

export type ContrastPair = { fg: PaletteName; bg: PaletteName; role: string; kind: PairKind };

/** Todos os pares de cor que o site usa, por superfície. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  // Marinho (fundo dominante)
  { fg: "branco", bg: "marinho", role: "Texto principal", kind: "texto" },
  { fg: "celeste", bg: "marinho", role: "Texto secundário", kind: "texto" },
  { fg: "serenity", bg: "marinho", role: "Destaque, links", kind: "texto" },
  { fg: "coral", bg: "marinho", role: "Erro", kind: "texto" },
  { fg: "marinho", bg: "branco", role: "Botão primário (marinho sobre branco)", kind: "texto" },
  { fg: "branco", bg: "marinho", role: "Anel de foco", kind: "interface" },
  {
    fg: "serenity",
    bg: "marinho",
    role: "Borda de campo e divisória funcional",
    kind: "interface",
  },
  // Royal (rodapé)
  { fg: "branco", bg: "royal", role: "Texto no rodapé", kind: "texto" },
  { fg: "celeste", bg: "royal", role: "Texto secundário no rodapé", kind: "texto" },
  { fg: "serenity", bg: "royal", role: "Destaque no rodapé", kind: "texto" },
  { fg: "coral", bg: "royal", role: "Erro no royal", kind: "texto" },
  // Noite
  { fg: "branco", bg: "noite", role: "Texto sobre noite", kind: "texto" },
  { fg: "celeste", bg: "noite", role: "Secundário sobre noite", kind: "texto" },
  // Relevo (cartões claros, formulários)
  { fg: "marinho", bg: "relevo", role: "Texto principal", kind: "texto" },
  { fg: "lousa", bg: "relevo", role: "Texto secundário", kind: "texto" },
  { fg: "royal", bg: "relevo", role: "Links, destaque", kind: "texto" },
  { fg: "erro", bg: "relevo", role: "Erro", kind: "texto" },
  { fg: "relevo", bg: "marinho", role: "Botão primário (relevo sobre marinho)", kind: "texto" },
  { fg: "royal", bg: "relevo", role: "Anel de foco, borda de campo", kind: "interface" },
  // Branco (campos dentro do relevo)
  { fg: "marinho", bg: "branco", role: "Texto no campo", kind: "texto" },
  { fg: "lousa", bg: "branco", role: "Dica e placeholder no campo", kind: "texto" },
  { fg: "erro", bg: "branco", role: "Erro no campo", kind: "texto" },
  { fg: "royal", bg: "branco", role: "Borda de campo", kind: "interface" },
  // Serenity e celeste como fundo (amostras, selos)
  { fg: "marinho", bg: "serenity", role: "Texto sobre serenity", kind: "texto" },
  { fg: "marinho", bg: "celeste", role: "Texto sobre azul-claro", kind: "texto" },
];

/** Razão mínima da WCAG 2.2 AA para cada papel. */
export function minimumRatio(kind: PairKind): number {
  return kind === "texto" ? 4.5 : 3;
}
