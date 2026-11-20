import { api } from "../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../ui.tsx";

/* Fase 2, frente A (docs/saas/fase-2.md): página reservada; a frente substitui este conteúdo. */
export function Galeria() {
  const { data, error, loading, reload } = useLoad(() => api<unknown>("/media"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader title="Galeria" subtitle="Fotos do evento: envio, ordem, legendas e álbuns." />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
