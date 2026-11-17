import type { Gift } from "@casamento/shared";

/*
 * Regras puras da lista de presentes (sem React), testadas no Vitest:
 * filtros por faixa de preço, leitura de valores em reais e textos de cota.
 */

/** "150", "150,5", "R$ 1.234,56" → centavos. null se não for um número. */
export function parseReais(input: string): number | null {
  const clean = input.replace(/R\$|\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(clean)) return null;
  const [int, dec = ""] = clean.replaceAll(".", "").split(",");
  return Number(int) * 100 + Number(dec.padEnd(2, "0"));
}

export type PriceRange = { id: string; label: string; min: number; max: number };

/** Faixas do filtro de preço (preço de uma cota). */
export const PRICE_RANGES: PriceRange[] = [
  { id: "todos", label: "Qualquer valor", min: 0, max: Infinity },
  { id: "ate-300", label: "Até R$ 300", min: 0, max: 30_000 },
  { id: "300-600", label: "R$ 300 a R$ 600", min: 30_000, max: 60_000 },
  { id: "acima-600", label: "Acima de R$ 600", min: 60_000 + 1, max: Infinity },
];

/**
 * Filtra por categoria e faixa. O valor livre entra em qualquer faixa (a
 * pessoa escolhe o valor), mas respeita a categoria.
 */
export function filterGifts(gifts: Gift[], category: string, rangeId: string): Gift[] {
  const range = PRICE_RANGES.find((r) => r.id === rangeId) ?? PRICE_RANGES[0]!;
  return gifts.filter((g) => {
    if (category !== "todos" && g.category !== category) return false;
    if (g.openAmount) return true;
    return g.priceCents >= range.min && g.priceCents <= range.max;
  });
}

/** "3 de 4 cotas disponíveis", "Última cota", "Presente único". */
export function quotaText(g: Pick<Gift, "quotaTotal" | "quotaLeft" | "openAmount">): string {
  if (g.openAmount) return "Você escolhe o valor";
  if (g.quotaTotal === 1) return g.quotaLeft ? "Presente único" : "Já presenteado";
  if (g.quotaLeft === 0) return "Todas as cotas presenteadas";
  if (g.quotaLeft === 1) return `Última cota de ${g.quotaTotal}`;
  return `${g.quotaLeft} de ${g.quotaTotal} cotas disponíveis`;
}

/** Primeiro nome, para o agradecimento. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Minutos e segundos até `iso` ("29:05"); "0:00" se já passou. */
export function timeLeft(iso: string, now: number): string {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}:${String(sec).padStart(2, "0")}`;
}
