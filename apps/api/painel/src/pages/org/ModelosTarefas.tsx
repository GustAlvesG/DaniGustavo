import { PageHeader } from "../../ui.tsx";

/** Fase 4, frente A (docs/saas/fase-4.md): modelos de tarefas da organização (#/o/:orgId/modelos, #/o/:orgId/modelos/:id). Reservada pela fundação. */
export function ModelosTarefas({ id }: { id?: number }) {
  void id;
  return (
    <div className="stack">
      <PageHeader title="Modelos de tarefas" subtitle="Em construção." />
    </div>
  );
}
