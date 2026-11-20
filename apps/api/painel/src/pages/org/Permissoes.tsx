import { orgApi } from "../../api.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";

/* Fase 3, frente C (docs/saas/fase-3.md): página reservada; a frente substitui este conteúdo. */
export function PermissoesAnfitriao({ eventId }: { eventId: number }) {
  const { data, error, loading, reload } = useLoad(
    () => orgApi<unknown>(`/events/${eventId}/host-permissions`),
    [eventId],
  );
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Permissões do anfitrião"
        subtitle="O que os anfitriões deste evento podem fazer no painel."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <p className="muted">Em construção.</p> : null}
    </div>
  );
}
