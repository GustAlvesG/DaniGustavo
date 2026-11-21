import { PageHeader } from "../ui.tsx";

/** Fase 4, frente C (docs/saas/fase-4.md): orçamentos, parcelas e planejado × realizado (#/financeiro, #/financeiro/orcamentos/:id). Reservada pela fundação. */
export function Financeiro({ quoteId }: { quoteId?: number }) {
  void quoteId;
  return (
    <div className="stack">
      <PageHeader title="Financeiro" subtitle="Em construção." />
    </div>
  );
}
