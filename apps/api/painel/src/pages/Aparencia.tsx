import { api } from "../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../ui.tsx";

/* Fase 2, frente C (docs/saas/fase-2.md): página reservada; a frente substitui este conteúdo. */
export function Aparencia() {
  const { data, error, loading, reload } = useLoad(() => api<unknown>("/appearance"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader title="Aparência" subtitle="Tema, cores e fontes do site." />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
