import { orgApi } from "../../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";

/* Fase 3, frente B (docs/saas/fase-3.md): página reservada; a frente substitui este conteúdo. */
export function Anfitrioes({ eventId }: { eventId: number }) {
  const { data, error, loading, reload } = useLoad(
    () => orgApi<unknown>(`/events/${eventId}/hosts`),
    [eventId],
  );
  return (
    <div className="stack stack--lg">
      <PageHeader title="Anfitriões" subtitle="Quem administra este evento pelo painel." />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
