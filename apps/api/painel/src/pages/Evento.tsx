import { api } from "../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../ui.tsx";

/* Fase 2, frente D (docs/saas/fase-2.md): página reservada; a frente substitui este conteúdo. */
export function Evento() {
  const { data, error, loading, reload } = useLoad(() => api<unknown>("/config"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Evento"
        subtitle="Tipo do evento, módulos, lados dos convites e palavras do site."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
