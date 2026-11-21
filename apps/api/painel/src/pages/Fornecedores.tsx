import { PageHeader } from "../ui.tsx";

/** Fase 4, frente B (docs/saas/fase-4.md): fornecedores do evento e contratos (#/fornecedores, #/fornecedores/:id). Reservada pela fundação. */
export function Fornecedores({ id }: { id?: number }) {
  void id;
  return (
    <div className="stack">
      <PageHeader title="Fornecedores" subtitle="Em construção." />
    </div>
  );
}
