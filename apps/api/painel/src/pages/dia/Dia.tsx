import {
  CHECKIN_POLL_MS,
  type CheckinOverview,
  type ScheduleItemRow,
  type ScheduleView,
  type SeatingView,
  type TaskList,
  type TaskRow,
} from "@casamento/shared";
import { useEffect, useState } from "react";
import { api } from "../../api.ts";
import { useCan, useEvent } from "../../event.tsx";
import { formatDate, plural } from "../../format.ts";
import { eh } from "../../nav.ts";
import { Loading, PageHeader } from "../../ui.tsx";
import "./dia.css";

/*
 * "Hoje" (Fase 7, frente D, #/e/:id/dia): a tela do celular no dia do evento. Junta a contagem
 * do check-in, os próximos itens do cronograma, as tarefas de hoje e atrasadas e as mesas. Cada
 * bloco vem da rota da sua área; se a área não responde (ainda não existe, sem permissão ou
 * módulo fora do ar), o bloco some em silêncio e fica só o atalho.
 */

type Quiet<T> = { state: "loading" } | { state: "off" } | { state: "ok"; data: T };

/** Carrega uma rota e vira "off" em qualquer falha (501, 403, rede): sem alarde. */
function useQuiet<T>(path: string, pollMs?: number): Quiet<T> {
  const [value, setValue] = useState<Quiet<T>>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () =>
      api<T>(path)
        .then((data) => {
          if (!alive) return;
          setValue({ state: "ok", data });
          if (pollMs) timer = setTimeout(run, pollMs);
        })
        .catch(() => alive && setValue({ state: "off" }));
    void run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [path, pollMs]);
  return value;
}

/** "AAAA-MM-DD" de hoje no fuso do evento. */
export function localToday(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Dias de hoje até a data do evento (negativo = já passou), pelas datas de calendário. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Itens do cronograma a mostrar: os de hoje; sem nenhum hoje, os do próximo dia com itens. */
export function upcomingItems(
  items: ScheduleItemRow[],
  today: string,
  limit = 8,
): { date: string | null; items: ScheduleItemRow[] } {
  const future = items.filter((i) => i.date >= today);
  const date = future[0]?.date ?? null;
  return { date, items: future.filter((i) => i.date === date).slice(0, limit) };
}

function Meter({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="meter" aria-hidden="true">
      <span className="meter__ok" style={{ width: `${pct}%` }} />
    </div>
  );
}

function CheckinCard() {
  const q = useQuiet<CheckinOverview>("/checkin", CHECKIN_POLL_MS);
  return (
    <section className="card dia-card" aria-labelledby="dia-checkin">
      <div className="card__head">
        <h2 id="dia-checkin">Chegadas</h2>
        <a className="link-small" href={eh("/checkin")}>
          Abrir check-in
        </a>
      </div>
      {q.state === "loading" && <Loading />}
      {q.state === "off" && <p className="muted">O check-in não está disponível agora.</p>}
      {q.state === "ok" && (
        <>
          <p className="dia-big" data-testid="dia-chegadas">
            {q.data.totals.arrivedPeople}
            <span className="muted"> de {q.data.totals.expectedPeople}</span>
          </p>
          <Meter value={q.data.totals.arrivedPeople} max={q.data.totals.expectedPeople} />
          <p className="muted small">
            {plural(q.data.totals.arrivedPeople, "pessoa chegou", "pessoas chegaram")} ·{" "}
            {q.data.totals.arrivedInvitations} de {q.data.totals.expectedInvitations} convites
          </p>
        </>
      )}
    </section>
  );
}

function ScheduleCard({ today }: { today: string }) {
  const q = useQuiet<ScheduleView>("/schedule");
  const picked = q.state === "ok" ? upcomingItems(q.data.items, today) : null;
  return (
    <section className="card dia-card" aria-labelledby="dia-crono">
      <div className="card__head">
        <h2 id="dia-crono">
          {picked?.date && picked.date !== today ? "Cronograma" : "Cronograma de hoje"}
        </h2>
        <a className="link-small" href={eh("/cronograma")}>
          Ver tudo
        </a>
      </div>
      {q.state === "loading" && <Loading />}
      {q.state === "off" && <p className="muted">O cronograma não está disponível agora.</p>}
      {picked && picked.items.length === 0 && (
        <p className="muted">Nenhuma atividade a partir de hoje.</p>
      )}
      {picked && picked.items.length > 0 && (
        <>
          {picked.date !== today && picked.date && (
            <p className="muted small">Próximo dia com atividades: {formatDate(picked.date)}.</p>
          )}
          <ul className="dia-list">
            {picked.items.map((i) => (
              <li key={i.id}>
                <span className="dia-time">{i.startTime}</span>
                <span>
                  <strong>{i.title}</strong>
                  {(i.location || i.responsible) && (
                    <span className="muted small dia-sub">
                      {[i.location, i.responsible].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TasksCard({ today }: { today: string }) {
  const q = useQuiet<TaskList>("/tasks?view=open");
  const due: TaskRow[] =
    q.state === "ok" ? q.data.tasks.filter((t) => t.dueOn !== null && t.dueOn <= today) : [];
  return (
    <section className="card dia-card" aria-labelledby="dia-tarefas">
      <div className="card__head">
        <h2 id="dia-tarefas">Tarefas de hoje</h2>
        <a className="link-small" href={eh("/tarefas")}>
          Ver tarefas
        </a>
      </div>
      {q.state === "loading" && <Loading />}
      {q.state === "off" && <p className="muted">As tarefas não estão disponíveis agora.</p>}
      {q.state === "ok" && due.length === 0 && (
        <p className="muted">Nada vence hoje nem está atrasado.</p>
      )}
      {due.length > 0 && (
        <ul className="dia-list">
          {due.slice(0, 8).map((t) => (
            <li key={t.id}>
              <span className={`badge badge--${t.dueOn === today ? "warn" : "error"}`}>
                {t.dueOn === today ? "Hoje" : "Atrasada"}
              </span>
              <span>
                <strong>{t.title}</strong>
                {t.assignee && <span className="muted small dia-sub">{t.assignee.name}</span>}
              </span>
            </li>
          ))}
          {due.length > 8 && <li className="muted small">e mais {due.length - 8}…</li>}
        </ul>
      )}
    </section>
  );
}

function SeatingCard() {
  const q = useQuiet<SeatingView>("/seating");
  const over = q.state === "ok" ? q.data.tables.filter((t) => t.overCapacity) : [];
  return (
    <section className="card dia-card" aria-labelledby="dia-mesas">
      <div className="card__head">
        <h2 id="dia-mesas">Mesas</h2>
        <a className="link-small" href={eh("/mesas")}>
          Abrir mesas
        </a>
      </div>
      {q.state === "loading" && <Loading />}
      {q.state === "off" && <p className="muted">As mesas não estão disponíveis agora.</p>}
      {q.state === "ok" && (
        <>
          <p className="dia-big">
            {q.data.stats.seated}
            <span className="muted"> de {q.data.stats.confirmed} acomodados</span>
          </p>
          <Meter value={q.data.stats.seated} max={q.data.stats.confirmed} />
          <p className="muted small">
            {plural(q.data.stats.tables, "mesa", "mesas")} · {q.data.stats.seats} lugares
          </p>
          {over.length > 0 && (
            <p className="alert alert--warn">
              Lotação acima dos lugares: {over.map((t) => t.name).join(", ")}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function Dia() {
  const ev = useEvent();
  const today = localToday(ev.timezone);
  const eventDay = ev.startsAt ? localToday(ev.timezone, new Date(ev.startsAt)) : null;
  const diff = eventDay ? daysBetween(today, eventDay) : null;
  const subtitle =
    diff === null
      ? "O resumo do dia do evento."
      : diff > 0
        ? `Faltam ${plural(diff, "dia", "dias")} para ${ev.name}.`
        : diff === 0
          ? `Hoje é o dia de ${ev.name}.`
          : `${ev.name} foi em ${formatDate(eventDay)}.`;

  const canCheckin = useCan("checkin.read");
  const canSeating = useCan("seating.read");
  const canSchedule = useCan("schedule.read");
  const canTasks = useCan("tasks.read");
  const canWhatsapp = useCan("whatsapp.send");
  return (
    <div className="stack stack--lg">
      <PageHeader title="Hoje" subtitle={subtitle} />
      <div className="dia-shortcuts" role="navigation" aria-label="Atalhos do dia">
        {canCheckin && (
          <a className="button" href={eh("/checkin")}>
            Check-in
          </a>
        )}
        {canSeating && (
          <a className="button button--ghost" href={eh("/mesas")}>
            Mesas
          </a>
        )}
        {canSchedule && (
          <a className="button button--ghost" href={eh("/cronograma")}>
            Cronograma
          </a>
        )}
        {canTasks && (
          <a className="button button--ghost" href={eh("/tarefas")}>
            Tarefas
          </a>
        )}
        {canWhatsapp && (
          <a className="button button--ghost" href={eh("/whatsapp")}>
            WhatsApp
          </a>
        )}
      </div>
      <div className="grid grid--2">
        {canCheckin && <CheckinCard />}
        {canSeating && <SeatingCard />}
        {canSchedule && <ScheduleCard today={today} />}
        {canTasks && <TasksCard today={today} />}
      </div>
    </div>
  );
}
