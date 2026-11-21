import type { PlatformTaskTemplateView } from "@casamento/shared";
import { EVENT_TYPE_LABELS } from "@casamento/shared";
import { apiRoot } from "../../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";

/*
 * Fase 6: modelos de tarefas prontos da plataforma (#/plataforma/modelos). A API é da frente E
 * (`/api/admin/platform/task-templates`); aqui, a consulta. Os modelos vêm do seed
 * (packages/db/src/platform-task-templates.ts) e as organizações copiam/aplicam pelo painel delas.
 */

const typeLabel = (t: string | null) =>
  t ? ((EVENT_TYPE_LABELS as Record<string, string>)[t] ?? t) : "Qualquer tipo";

const offset = (days: number) =>
  days === 0 ? "no dia" : days < 0 ? `${Math.abs(days)} dia(s) antes` : `${days} dia(s) depois`;

export function ModelosPlataforma() {
  const { data, error, loading, reload } = useLoad(
    () => apiRoot<{ templates: PlatformTaskTemplateView[] }>("/platform/task-templates"),
    [],
  );
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Modelos de tarefas"
        subtitle="Listas prontas por tipo de evento, que as organizações copiam ou aplicam."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data && data.templates.length === 0 ? (
        <p className="empty">Nenhum modelo cadastrado.</p>
      ) : null}
      {data?.templates.map((t) => (
        <section key={t.id} className="card stack" aria-labelledby={`modelo-${t.id}`}>
          <div className="card__head">
            <h2 id={`modelo-${t.id}`}>{t.name}</h2>
            <span className="muted small">{typeLabel(t.eventType)}</span>
          </div>
          {t.description ? <p className="muted">{t.description}</p> : null}
          <ul className="rows">
            {t.items.map((i) => (
              <li key={i.id} className="row">
                <div className="row__main">
                  <span className="row__title">{i.title}</span>
                  <span className="row__meta">{offset(i.offsetDays)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
