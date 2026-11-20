import { orgApi } from "../../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";

/* Fase 3, frente A (docs/saas/fase-3.md): página reservada; a frente substitui este conteúdo. */
export function OrgEventos() {
  const { data, error, loading, reload } = useLoad(() => orgApi<unknown>("/events"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader title="Eventos" subtitle="Todos os eventos da organização." />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
