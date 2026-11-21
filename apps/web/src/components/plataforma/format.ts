import { LIMIT_LABELS, type PlanLimits, type PlanView } from "@casamento/shared";

/* Fase 6, frente B: textos da página de preços (puros, testados no Vitest). */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 49,90" ou null (preço ainda não definido: TODO(conteudo) no catálogo). */
export function formatPrice(cents: number | null): string | null {
  return cents === null ? null : brl.format(cents / 100).replace(/ /g, " ");
}

/** Linha de preço do cartão do plano. */
export function priceLine(plan: Pick<PlanView, "priceMonthlyCents" | "priceYearlyCents">): string {
  const monthly = formatPrice(plan.priceMonthlyCents);
  if (monthly) return `${monthly} por mês`;
  const yearly = formatPrice(plan.priceYearlyCents);
  if (yearly) return `${yearly} por ano`;
  return "Preço em breve";
}

/** 50 bps → "0,5%". */
export function formatFee(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Limites em frases curtas ("Até 300 convidados por evento"); sem limite → "à vontade". */
export function limitLines(limits: PlanLimits): string[] {
  const n = (v: number) => v.toLocaleString("pt-BR");
  const lines: string[] = [];
  lines.push(
    limits.activeEvents === null
      ? "Eventos ativos à vontade"
      : limits.activeEvents === 1
        ? "1 evento ativo por vez"
        : `Até ${n(limits.activeEvents)} eventos ativos`,
  );
  lines.push(
    limits.guestsPerEvent === null
      ? "Convidados à vontade"
      : `Até ${n(limits.guestsPerEvent)} convidados por evento`,
  );
  lines.push(
    limits.members === null
      ? "Equipe sem limite"
      : limits.members === 1
        ? "1 pessoa na equipe"
        : `Até ${n(limits.members)} pessoas na equipe`,
  );
  if (limits.storageMb !== null) {
    lines.push(
      limits.storageMb >= 1000
        ? `${n(Math.round(limits.storageMb / 100) / 10)} GB para fotos e arquivos`
        : `${n(limits.storageMb)} MB para fotos e arquivos`,
    );
  } else {
    lines.push(`${LIMIT_LABELS.storageMb.replace(/ \(MB\)$/, "")} à vontade`);
  }
  return lines;
}

/** Teste grátis em palavras. */
export function trialLine(days: number): string | null {
  if (days <= 0) return null;
  return days === 1 ? "1 dia grátis para experimentar" : `${days} dias grátis para experimentar`;
}
