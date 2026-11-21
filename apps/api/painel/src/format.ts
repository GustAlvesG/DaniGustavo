const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatBRL = (cents: number) => brl.format(cents / 100);

/** "150,00" / "150" / "1.500,50" → centavos; null se inválido. */
export function parseBRL(text: string): number | null {
  const clean = text
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Centavos → "150,00" para o campo. */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

const TZ = "America/Sao_Paulo";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Data de calendário ("AAAA-MM-DD", prazos e parcelas): o JS lê como meia-noite UTC; mostrar
  // em UTC mantém o dia (em São Paulo cairia no dia anterior).
  const calendar = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: calendar ? "UTC" : TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

/** Dias inteiros até a data (negativo se já passou). */
export function daysUntil(iso: string, now = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Data com fuso guardada em settings ("2027-04-10T16:00:00-03:00") ↔ campo datetime-local.
 * O horário digitado é o de Brasília; o fuso original é mantido ao salvar.
 */
export const isoToLocalInput = (iso: string) => iso.slice(0, 19);
export function localInputToIso(local: string, previousIso: string): string {
  const offset = /([+-]\d{2}:\d{2}|Z)$/.exec(previousIso)?.[1] ?? "-03:00";
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return `${withSeconds}${offset}`;
}
