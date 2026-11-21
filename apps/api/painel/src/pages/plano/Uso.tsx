import type { PlanLimits, UsageView } from "@casamento/shared";
import { LIMIT_LABELS, MODULE_LABELS } from "@casamento/shared";
import { formatDateTime } from "../../format.ts";

/*
 * Fase 6, frente A: uso da organização frente aos limites do plano (página do plano e painel da
 * plataforma). `limits` nulo = sem assinatura (sem limites).
 */

const MB = 1024 * 1024;

const formatMb = (bytes: number) =>
  `${(bytes / MB).toLocaleString("pt-BR", { maximumFractionDigits: bytes < 10 * MB ? 1 : 0 })} MB`;

function Linha({ label, used, limit }: { label: string; used: string; limit: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {used}
        <span className="muted small"> de {limit}</span>
      </dd>
    </div>
  );
}

export function UsoDoPlano({ usage, limits }: { usage: UsageView; limits: PlanLimits | null }) {
  const cap = (n: number | null | undefined) =>
    n === null || n === undefined ? "sem limite" : n.toLocaleString("pt-BR");
  const modules = limits?.modules ?? null;
  return (
    <div className="stack">
      <dl className="tally" data-testid="uso-plano">
        <Linha
          label={LIMIT_LABELS.activeEvents}
          used={String(usage.activeEvents)}
          limit={cap(limits?.activeEvents)}
        />
        <Linha
          label="Convidados no maior evento"
          used={usage.maxGuestsInEvent.toLocaleString("pt-BR")}
          limit={cap(limits?.guestsPerEvent)}
        />
        <Linha
          label={LIMIT_LABELS.members}
          used={String(usage.members)}
          limit={cap(limits?.members)}
        />
        <Linha
          label="Espaço em disco"
          used={formatMb(usage.storageBytes)}
          limit={
            limits?.storageMb === null || limits?.storageMb === undefined
              ? "sem limite"
              : `${limits.storageMb.toLocaleString("pt-BR")} MB`
          }
        />
      </dl>
      <p className="muted small">
        Módulos do site:{" "}
        {modules === null
          ? "todos"
          : modules.length === 0
            ? "nenhum"
            : modules.map((m) => MODULE_LABELS[m]).join(", ")}
        .{" "}
        {usage.storageComputedAt
          ? `Espaço medido em ${formatDateTime(usage.storageComputedAt)}.`
          : "O espaço em disco é medido de hora em hora."}
      </p>
    </div>
  );
}
