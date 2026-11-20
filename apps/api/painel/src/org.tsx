import { createContext, useContext } from "react";
import type { MeOrganization } from "./event.tsx";
import { oh } from "./nav.ts";
import { Anfitrioes } from "./pages/org/Anfitrioes.tsx";
import { ConvitesEquipe } from "./pages/org/Convites.tsx";
import { Equipe } from "./pages/org/Equipe.tsx";
import { OrgEventos } from "./pages/org/Eventos.tsx";
import { OrgInicio } from "./pages/org/Inicio.tsx";
import { NovoEvento } from "./pages/org/NovoEvento.tsx";
import { PermissoesAnfitriao } from "./pages/org/Permissoes.tsx";

/*
 * Painel da organização (Fase 3, docs/saas/fase-3.md): `#/o/:orgId/...`. Páginas das frentes
 * A (início, eventos, novo evento), B (equipe, convites, anfitriões) e C (permissões).
 */

const OrgContext = createContext<MeOrganization | null>(null);
export const OrgProvider = OrgContext.Provider;

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
];

/** "/o/2/equipe" → { orgId: 2, rest: "/equipe" }; outro caminho → null. */
export function parseOrgPath(path: string): { orgId: number; rest: string } | null {
  const m = /^\/o\/([1-9]\d{0,15})(\/.*)?$/.exec(path);
  return m ? { orgId: Number(m[1]), rest: m[2] ?? "/" } : null;
}

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
      if (!id) return <OrgEventos />;
      break;
    case "equipe":
      return <Equipe />;
    case "convites":
      return <ConvitesEquipe />;
  }
  return (
    <div className="stack">
      <h1>Página não encontrada</h1>
      <a href={oh("/")}>Voltar ao início da organização</a>
    </div>
  );
}
