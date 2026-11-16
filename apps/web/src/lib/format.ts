const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata um valor em centavos como moeda brasileira (ex.: 12345 -> "R$ 123,45"). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}
