import { PageHeader } from "../../ui.tsx";

/** Fase 5, frente C (docs/saas/fase-5.md): subconta da organização e contas das pessoas (#/o/:orgId/recebimentos, #/o/:orgId/recebimentos/:id). Reservada pela fundação. */
export function OrgRecebimentos({ id }: { id?: number }) {
  void id;
  return (
    <div className="stack">
      <PageHeader title="Recebimentos" subtitle="Em construção." />
    </div>
  );
}
