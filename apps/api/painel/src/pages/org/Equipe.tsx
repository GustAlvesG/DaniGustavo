import { orgApi } from "../../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";

/* Fase 3, frente B (docs/saas/fase-3.md): página reservada; a frente substitui este conteúdo. */
export function Equipe() {
  const { data, error, loading, reload } = useLoad(() => orgApi<unknown>("/members"), []);
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Equipe"
        subtitle="Quem ajuda a organizar os eventos e o papel de cada um."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
