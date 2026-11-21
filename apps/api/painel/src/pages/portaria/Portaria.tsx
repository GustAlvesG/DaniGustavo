/*
 * Fase 7, frente A (docs/saas/fase-7.md): portaria, sem conta, em `/portaria/#<token>` no host
 * da API (mesmo build do painel; o App.tsx abre esta página pelo `location.pathname`). PIN →
 * sessão (Bearer) → leitor de QR pela câmera (`BarcodeDetector` quando existir; senão digitação
 * ou busca por nome) → marcar chegada (parcial) e desfazer, com contagem por polling.
 * Reservada pela fundação.
 */
export function Portaria() {
  return (
    <main className="shell shell--center">
      <section className="card card--narrow stack">
        <h1>Portaria</h1>
        <p className="muted">Em breve.</p>
      </section>
    </main>
  );
}
