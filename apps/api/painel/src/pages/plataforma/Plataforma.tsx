import { ph } from "./links.ts";
import { PlanosPlataforma } from "./Planos.tsx";
import { ModelosPlataforma } from "./Modelos.tsx";
import { OrganizacaoPlataforma, OrganizacoesPlataforma } from "./Organizacoes.tsx";
import { VisaoGeral } from "./VisaoGeral.tsx";

/*
 * Fase 6, frente A (docs/saas/fase-6.md): painel da plataforma (#/plataforma/*), só para o
 * platform admin (a API responde 404 de rota para os demais). Visão geral, organizações (plano,
 * situação, uso, suspender, taxa negociada), planos e os modelos de tarefas da plataforma.
 */

const TABS = [
  { href: "/", label: "Visão geral" },
  { href: "/organizacoes", label: "Organizações" },
  { href: "/planos", label: "Planos" },
  { href: "/modelos", label: "Modelos de tarefas" },
];

function Abas({ section }: { section: string }) {
  return (
    <nav className="tabs" aria-label="Seções da plataforma">
      {TABS.map((t) => (
        <a
          key={t.href}
          className="tab"
          href={ph(t.href)}
          aria-current={section === t.href ? "page" : undefined}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

function Pagina({ path }: { path: string }) {
  const [section, id] = path.split("?")[0]!.split("/").filter(Boolean);
  switch (section) {
    case undefined:
      return <VisaoGeral />;
    case "organizacoes":
      if (id && /^[1-9]\d{0,15}$/.test(id)) return <OrganizacaoPlataforma orgId={Number(id)} />;
      if (!id) return <OrganizacoesPlataforma />;
      break;
    case "planos":
      return <PlanosPlataforma code={id ?? null} />;
    case "modelos":
      return <ModelosPlataforma />;
  }
  return (
    <div className="stack">
      <h1>Página não encontrada</h1>
      <a href={ph("/")}>Voltar à visão geral da plataforma</a>
    </div>
  );
}

export function Plataforma({ path }: { path: string }) {
  const section = `/${path.split("?")[0]!.split("/")[1] ?? ""}`;
  return (
    <div className="stack stack--lg">
      <Abas section={section} />
      <Pagina path={path} />
    </div>
  );
}
