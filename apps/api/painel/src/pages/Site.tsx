import { api } from "../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../ui.tsx";

/* Fase 2, frente A (docs/saas/fase-2.md): página reservada; a frente substitui este conteúdo. */
export function Site() {
  const { data, error, loading, reload } = useLoad(() => api<unknown>("/site"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader title="Site" subtitle="Textos e fotos das seções do site." />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
