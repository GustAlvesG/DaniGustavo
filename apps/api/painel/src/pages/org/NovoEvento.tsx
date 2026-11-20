import { PageHeader } from "../../ui.tsx";

/* Fase 3, frente A (docs/saas/fase-3.md): página reservada; a frente substitui este conteúdo. */
export function NovoEvento() {
  return (
    <div className="stack stack--lg">
      <PageHeader title="Novo evento" subtitle="Nome, tipo, data, endereço e domínio do evento." />
      <p className="muted">Em construção.</p>
    </div>
  );
}
