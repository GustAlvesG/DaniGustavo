import type { OrgDashboard } from "@casamento/shared";
import { orgApi } from "../../api.ts";
import { formatBRL } from "../../format.ts";
import { eventPath, oh } from "../../nav.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";
import { EventNumbers, EventStatusBadge } from "./Eventos.tsx";

export function OrgInicio() {
  const { data, error, loading, reload } = useLoad(() => orgApi<OrgDashboard>("/dashboard"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader
        title={data ? data.organization.name : "Início da organização"}
        subtitle="Eventos com data, convidados, confirmados e presentes recebidos."
        actions={
          <a className="button" href={oh("/eventos/novo")}>
            Novo evento
          </a>
        }
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <dl className="tally">
            <div>
              <dt>Eventos</dt>
              <dd>{data.totals.events}</dd>
            </div>
            <div>
              <dt>Convidados</dt>
              <dd>{data.totals.guests}</dd>
            </div>
            <div>
              <dt>Confirmados</dt>
              <dd>{data.totals.confirmed}</dd>
            </div>
            <div>
              <dt>Presentes recebidos</dt>
              <dd>{formatBRL(data.totals.giftsReceivedCents)}</dd>
            </div>
          </dl>
          {data.events.length === 0 ? (
            <p className="empty">Nenhum evento ainda. Crie o primeiro em “Novo evento”.</p>
          ) : (
            <ul className="rows">
              {data.events.map((e) => (
                <li key={e.id} className="row">
                  <a className="row__main" href={eventPath(e.id)}>
                    <EventNumbers e={e} />
                  </a>
                  <div className="row__side">
                    <EventStatusBadge status={e.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
