import { createContext, useContext } from "react";
import type { MeOrganization } from "./event.tsx";
import { oh } from "./nav.ts";
import { parseOrgPath } from "./routes.ts";
import { Anfitrioes } from "./pages/org/Anfitrioes.tsx";
import { ConvitesEquipe } from "./pages/org/Convites.tsx";
import { Equipe } from "./pages/org/Equipe.tsx";
import { OrgEventos } from "./pages/org/Eventos.tsx";
import { OrgInicio } from "./pages/org/Inicio.tsx";
import { NovoEvento } from "./pages/org/NovoEvento.tsx";
import { PermissoesAnfitriao } from "./pages/org/Permissoes.tsx";
import { OrgFornecedores } from "./pages/org/Fornecedores.tsx";
import { ModelosTarefas } from "./pages/org/ModelosTarefas.tsx";
import { OrgRecebimentos } from "./pages/org/Recebimentos.tsx";
import { OrgPlano } from "./pages/org/Plano.tsx";
import { OrgCategorias } from "./pages/org/Categorias.tsx";
import { Dominios } from "./pages/org/Dominios.tsx";
import { ApagarEvento } from "./pages/org/ApagarEvento.tsx";

/*
 * Painel da organização (Fase 3, docs/saas/fase-3.md): `#/o/:orgId/...`. Páginas das frentes
 * A (início, eventos, novo evento), B (equipe, convites, anfitriões) e C (permissões).
 */

const OrgContext = createContext<MeOrganization | null>(null);
export const OrgProvider = OrgContext.Provider;
export { parseOrgPath };

/*
 * Recarrega o `/me` do painel (lista de eventos e organizações). Quem cria ou muda um evento
 * chama antes de navegar: sem isso o evento novo não está na lista e o hash volta para #/eventos.
 */
const MeRefreshContext = createContext<() => Promise<void>>(() => Promise.resolve());
export const MeRefreshProvider = MeRefreshContext.Provider;
export const useRefreshMe = () => useContext(MeRefreshContext);

/** A organização aberta no painel (só dentro de /o/:orgId). */
export function useOrg(): MeOrganization {
  const org = useContext(OrgContext);
  if (!org) throw new Error("useOrg fora de uma organização");
  return org;
}

/** Menu da organização. */
export const ORG_NAV = [
  { href: "/", label: "Início" },
  { href: "/eventos", label: "Eventos" },
  { href: "/equipe", label: "Equipe" },
  { href: "/convites", label: "Convites pendentes" },
  // Fase 4: catálogo de fornecedores (B) e modelos de tarefas (A).
  { href: "/fornecedores", label: "Fornecedores" },
  { href: "/modelos", label: "Modelos de tarefas" },
  // Fase 5 (frente C): subcontas de recebimento.
  { href: "/recebimentos", label: "Recebimentos" },
  // Fase 6: plano e assinatura (A) e categorias de fornecedor próprias (E).
  { href: "/plano", label: "Plano" },
  { href: "/categorias", label: "Categorias" },
];

/** Página da organização; `path` é relativo a ela ("/eventos/3/anfitrioes"). */
export function OrgPage({ path }: { path: string }) {
  const [route = ""] = path.split("?");
  const [section, id, extra] = route.split("/").filter(Boolean);
  const eventId = id && /^[1-9]\d{0,15}$/.test(id) ? Number(id) : null;
  switch (section) {
    case undefined:
      return <OrgInicio />;
    case "eventos":
      if (id === "novo") return <NovoEvento />;
      if (eventId && extra === "anfitrioes") return <Anfitrioes eventId={eventId} />;
      if (eventId && extra === "permissoes") return <PermissoesAnfitriao eventId={eventId} />;
      // Fase 6: domínios do evento (B) e apagar evento arquivado (C).
      if (eventId && extra === "dominios") return <Dominios eventId={eventId} />;
      if (eventId && extra === "apagar") return <ApagarEvento eventId={eventId} />;
      if (!id) return <OrgEventos />;
      break;
    case "equipe":
      return <Equipe />;
    case "convites":
      return <ConvitesEquipe />;
    case "fornecedores":
      return <OrgFornecedores id={eventId ?? undefined} />;
    case "modelos":
      return <ModelosTarefas id={eventId ?? undefined} />;
    case "recebimentos":
      return <OrgRecebimentos id={eventId ?? undefined} />;
    case "plano":
      return <OrgPlano />;
    case "categorias":
      return <OrgCategorias />;
  }
  return (
    <div className="stack">
      <h1>Página não encontrada</h1>
      <a href={oh("/")}>Voltar ao início da organização</a>
    </div>
  );
}
