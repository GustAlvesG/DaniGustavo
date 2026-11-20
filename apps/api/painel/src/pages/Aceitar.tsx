import { teamInviteApi } from "../api.ts";
import { ErrorBox, Loading, useLoad } from "../ui.tsx";

/*
 * Fase 3, frente B (docs/saas/fase-3.md): aceite de convite da equipe/anfitrião em
 * #/aceitar/<token>. Abre com ou sem sessão (o App renderiza antes do login). Página
 * reservada; a frente substitui este conteúdo.
 */
export function Aceitar({ token }: { token: string }) {
  const { data, error, loading, reload } = useLoad(
    () => teamInviteApi<unknown>(`/${encodeURIComponent(token)}`),
    [token],
  );
  return (
    <main className="shell shell--center">
      <section className="card card--narrow stack">
        <h1>Convite para o painel</h1>
        {loading && !data ? <Loading /> : null}
        {error ? <ErrorBox message={error} onRetry={reload} /> : null}
        {data ? <p className="muted">Em construção.</p> : null}
      </section>
    </main>
  );
}
