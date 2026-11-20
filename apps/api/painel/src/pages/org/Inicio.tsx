import { orgApi } from "../../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";

/* Fase 3, frente A (docs/saas/fase-3.md): página reservada; a frente substitui este conteúdo. */
export function OrgInicio() {
  const { data, error, loading, reload } = useLoad(() => orgApi<unknown>("/dashboard"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Início da organização"
        subtitle="Eventos com data, convidados, confirmados e presentes recebidos."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
