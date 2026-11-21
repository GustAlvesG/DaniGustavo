import { PageHeader } from "../../ui.tsx";

/** Fase 4, frente B (docs/saas/fase-4.md): catálogo de fornecedores da organização (#/o/:orgId/fornecedores, #/o/:orgId/fornecedores/:id). Reservada pela fundação. */
export function OrgFornecedores({ id }: { id?: number }) {
  void id;
  return (
    <div className="stack">
      <PageHeader title="Fornecedores" subtitle="Em construção." />
    </div>
  );
}
