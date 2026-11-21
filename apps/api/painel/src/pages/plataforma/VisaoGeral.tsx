import type { PlatformOverview } from "@casamento/shared";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUSES } from "@casamento/shared";
import { apiRoot } from "../../api.ts";
import { formatBRL } from "../../format.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";

/* Fase 6, frente A: visão geral da plataforma (#/plataforma). */
export function VisaoGeral() {
  const { data, error, loading, reload } = useLoad(
    () => apiRoot<PlatformOverview>("/platform/overview"),
    [],
  );
  return (
    <div className="stack stack--lg">
      <PageHeader title="Plataforma" subtitle="Organizações, eventos, assinaturas e taxas." />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <dl className="tally" data-testid="plataforma-totais">
            <div>
              <dt>Organizações</dt>
              <dd>{data.organizations}</dd>
            </div>
            <div>
              <dt>Eventos ativos</dt>
              <dd>{data.activeEvents}</dd>
            </div>
            <div>
              <dt>Taxas nos últimos 30 dias</dt>
              <dd>{formatBRL(data.feesLast30DaysCents)}</dd>
            </div>
          </dl>
          <section className="stack" aria-labelledby="plat-assinaturas">
            <h2 id="plat-assinaturas">Assinaturas por situação</h2>
            <dl className="tally">
              {SUBSCRIPTION_STATUSES.map((s) => (
                <div key={s}>
                  <dt>{SUBSCRIPTION_STATUS_LABELS[s]}</dt>
                  <dd>{data.subscriptionsByStatus[s]}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}
