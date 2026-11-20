import { orgApi } from "../../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";

/* Fase 3, frente B (docs/saas/fase-3.md): página reservada; a frente substitui este conteúdo. */
export function ConvitesEquipe() {
  const { data, error, loading, reload } = useLoad(() => orgApi<unknown>("/invites"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Convites pendentes"
        subtitle="Convites para a equipe e para anfitriões que ainda não foram aceitos."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
