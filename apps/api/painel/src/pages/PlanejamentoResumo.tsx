import type { BudgetView, MeEvent, TaskList } from "@casamento/shared";
import { useEffect, useState } from "react";
import { api, apiRoot } from "../api.ts";
import { useCan } from "../event.tsx";
import { formatBRL, formatDate, plural } from "../format.ts";
import { eh } from "../nav.ts";

/*
 * Cartões de gestão (Fase 4) no início do evento e da organização. Consomem as rotas das
 * frentes de tarefas e orçamento; se responderem erro (501 antes da integração, 403 por
 * permissão), o cartão some em silêncio.
 */

function useQuiet<T>(load: () => Promise<T>, enabled: boolean, deps: unknown[]): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load()
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [enabled, ...deps]);
  return enabled ? data : null;
}

/** Cartões "Tarefas" e "Financeiro" do início do evento aberto. */
export function EventPlanningCards() {
  const canTasks = useCan("tasks.read");
  const canBudget = useCan("budget.read");
  const tasks = useQuiet(() => api<TaskList>("/tasks?view=overdue"), canTasks, []);
  const budget = useQuiet(() => api<BudgetView>("/budget"), canBudget, []);
  if (!tasks && !budget) return null;
  const openInstallments = budget?.openInstallments ?? [];
  const late = openInstallments.filter((i) => i.overdue);
  const next = openInstallments.filter((i) => !i.overdue).slice(0, 3);
  return (
    <div className="grid grid--2">
      {tasks && (
        <section className="card" aria-labelledby="d-tarefas">
          <h2 id="d-tarefas">Tarefas</h2>
          <dl className="tally">
            <div>
              <dt>Atrasadas</dt>
              <dd>{tasks.counts.overdue}</dd>
            </div>
            <div>
              <dt>Próximos 30 dias</dt>
              <dd>{tasks.counts.upcoming}</dd>
            </div>
            <div>
              <dt>Abertas</dt>
              <dd>{tasks.counts.open}</dd>
            </div>
          </dl>
          {tasks.tasks.length > 0 && (
            <ul className="plain small">
              {tasks.tasks.slice(0, 3).map((t) => (
                <li key={t.id}>
                  {t.title}
                  {t.dueOn ? ` · venceu em ${formatDate(t.dueOn)}` : ""}
                </li>
              ))}
            </ul>
          )}
          <a className="link-small" href={eh("/tarefas")}>
            Ver tarefas
          </a>
        </section>
      )}
      {budget && (
        <section className="card" aria-labelledby="d-financeiro">
          <h2 id="d-financeiro">Financeiro</h2>
          <dl className="tally">
            <div>
              <dt>Contratado</dt>
              <dd>{formatBRL(budget.totals.contractedCents)}</dd>
            </div>
            <div>
              <dt>Pago</dt>
              <dd>{formatBRL(budget.totals.paidCents)}</dd>
            </div>
          </dl>
          <p className="muted small">
            {late.length > 0
              ? `${plural(late.length, "parcela vencida", "parcelas vencidas")}. `
              : "Nenhuma parcela vencida. "}
            {next.length > 0 &&
              `Próximas: ${next.map((i) => `${formatBRL(i.amountCents)} em ${formatDate(i.dueOn)}`).join("; ")}.`}
          </p>
          <a className="link-small" href={eh("/financeiro")}>
            Ver financeiro
          </a>
        </section>
      )}
    </div>
  );
}

interface EventSummary {
  id: number;
  overdue: number;
  lateInstallments: number;
  nextDue: string | null;
}

/**
 * Resumo da organização: soma tarefas atrasadas e parcelas a vencer dos eventos (até 12,
 * os que não estão arquivados). Sem dado (rota fora do ar ou sem permissão): não mostra nada.
 */
export function OrgPlanningSummary({ events }: { events: Pick<MeEvent, "id" | "name">[] }) {
  const [rows, setRows] = useState<EventSummary[] | null>(null);
  const key = events.map((e) => e.id).join(",");
  useEffect(() => {
    let alive = true;
    Promise.all(
      events.slice(0, 12).map(async (e): Promise<EventSummary | null> => {
        const [t, b] = await Promise.allSettled([
          apiRoot<TaskList>(`/events/${e.id}/tasks?view=overdue`),
          apiRoot<BudgetView>(`/events/${e.id}/budget`),
        ]);
        if (t.status === "rejected" && b.status === "rejected") return null;
        const open = b.status === "fulfilled" ? b.value.openInstallments : [];
        return {
          id: e.id,
          overdue: t.status === "fulfilled" ? t.value.counts.overdue : 0,
          lateInstallments: open.filter((i) => i.overdue).length,
          nextDue: open.find((i) => !i.overdue)?.dueOn ?? null,
        };
      }),
    ).then((r) => alive && setRows(r.filter((x): x is EventSummary => x !== null)));
    return () => {
      alive = false;
    };
  }, [key]);
  if (!rows || rows.length === 0) return null;
  const overdue = rows.reduce((n, r) => n + r.overdue, 0);
  const late = rows.reduce((n, r) => n + r.lateInstallments, 0);
  const nextDue = rows
    .map((r) => r.nextDue)
    .filter((d): d is string => d !== null)
    .sort()[0];
  return (
    <section className="card" aria-labelledby="o-gestao">
      <h2 id="o-gestao">Gestão dos eventos</h2>
      <dl className="tally">
        <div>
          <dt>Tarefas atrasadas</dt>
          <dd>{overdue}</dd>
        </div>
        <div>
          <dt>Parcelas vencidas</dt>
          <dd>{late}</dd>
        </div>
        <div>
          <dt>Próximo vencimento</dt>
          <dd>{nextDue ? formatDate(nextDue) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}
