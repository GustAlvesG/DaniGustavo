import {
  type EventAccessView,
  type EventAction,
  type MeEvent,
  type MeOrganization,
  type MeResponse,
} from "@casamento/shared";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRoot } from "./api.ts";
import { formatDate } from "./format.ts";
import { eh, eventPath, orgPath } from "./nav.ts";
import { Badge, PageHeader } from "./ui.tsx";

export type { MeEvent, MeOrganization, MeResponse };

const EventContext = createContext<MeEvent | null>(null);
export const EventProvider = EventContext.Provider;

/** O evento aberto no painel (só dentro de /e/:eventId). */
export function useEvent(): MeEvent {
  const ev = useContext(EventContext);
  if (!ev) throw new Error("useEvent fora de um evento");
  return ev;
}

const TYPE_LABEL: Record<string, string> = {
  wedding: "Casamento",
  fifteen: "Festa de 15 anos",
  birthday: "Aniversário",
  other: "Evento",
};
export const typeLabel = (type: string) => TYPE_LABEL[type] ?? "Evento";

const ROLE_LABEL: Record<MeEvent["role"], string> = {
  platform_admin: "Administrador da plataforma",
  org_owner: "Dono da organização",
  org_member: "Membro da organização",
  event_host: "Anfitrião",
};
export const roleLabel = (role: MeEvent["role"]) => ROLE_LABEL[role];

/*
 * Permissões efetivas no evento (GET /events/:id/access, Fase 3). Se a rota falhar (ou ainda
 * não existir), vale "pode tudo": a API continua respondendo 403 onde faltar permissão.
 */
const AccessContext = createContext<EventAccessView | null>(null);
export const AccessProvider = AccessContext.Provider;

/** Busca o que o usuário pode no evento; `null` enquanto carrega ou se a rota falhar. */
export function useEventAccess(eventId: number | null): EventAccessView | null {
  const [state, setState] = useState<{ id: number; view: EventAccessView | null } | null>(null);
  useEffect(() => {
    if (eventId === null) return;
    let alive = true;
    apiRoot<EventAccessView>(`/events/${eventId}/access`)
      .then((view) => alive && setState({ id: eventId, view }))
      .catch(() => alive && setState({ id: eventId, view: null }));
    return () => {
      alive = false;
    };
  }, [eventId]);
  return state && state.id === eventId ? state.view : null;
}

/** O usuário pode esta ação no evento aberto? Sem informação da API: pode (fallback "tudo"). */
export function useCan(action: EventAction): boolean {
  const access = useContext(AccessContext);
  return !access || access.allowed.includes(action);
}

export function canDo(access: EventAccessView | null, action: EventAction): boolean {
  return !access || access.allowed.includes(action);
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "No ar",
  archived: "Arquivado",
};
export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

/** "Dani & Gustavo" → "D&G"; "Aniversário da Ana" → "AA"; sem nome → "·". */
export function monogramOf(name: string): string {
  const pair = name.split(/\s+(?:&|e)\s+/i);
  if (pair.length >= 2) {
    return `${pair[0]!.trim()[0] ?? ""}&${pair[1]!.trim()[0] ?? ""}`.toUpperCase();
  }
  const words = name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2);
  return words.map((w) => w[0]!.toUpperCase()).join("") || name.trim()[0]?.toUpperCase() || "·";
}

/** Lista de eventos e organizações (#/eventos). */
export function EventsPage({
  events,
  organizations = [],
}: {
  events: MeEvent[];
  organizations?: MeOrganization[];
}) {
  return (
    <div className="stack stack--lg">
      <PageHeader title="Seus eventos" />
      {organizations.length > 0 && (
        <section className="stack" aria-labelledby="orgs-titulo">
          <h2 id="orgs-titulo">Organizações</h2>
          <ul className="rows">
            {organizations.map((o) => (
              <li key={o.id} className="row">
                <a className="row__main" href={orgPath(o.id)}>
                  <span className="row__title">{o.name}</span>
                  <span className="row__meta">{ORG_ROLE_LABEL[o.role]}</span>
                </a>
                <div className="row__side">
                  {o.status === "suspended" && <Badge tone="archived">Suspensa</Badge>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="stack" aria-labelledby="eventos-titulo">
        <h2 id="eventos-titulo">Eventos</h2>
        <p className="muted">Escolha o evento que você quer administrar.</p>
        {events.length === 0 ? (
          <p className="muted">Nenhum evento ainda.</p>
        ) : (
          <ul className="rows">
            {events.map((e) => (
              <li key={e.id} className="row">
                <a className="row__main" href={eventPath(e.id)}>
                  <span className="row__title">{e.name}</span>
                  <span className="row__meta">
                    {typeLabel(e.type)} · {e.startsAt ? formatDate(e.startsAt) : "Sem data"} ·{" "}
                    {e.orgName} · {roleLabel(e.role)}
                  </span>
                </a>
                <div className="row__side">
                  <Badge tone={e.status}>{statusLabel(e.status)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const ORG_ROLE_LABEL: Record<MeOrganization["role"], string> = {
  platform_admin: "Administrador da plataforma",
  org_owner: "Dono",
  org_member: "Membro",
};

/** Página de gravação aberta por quem só pode ler (link direto): aviso e volta. */
export function NoWrite({ back }: { back: string }) {
  return (
    <div className="stack stack--lg">
      <a className="back" href={eh(back)}>
        ← Voltar
      </a>
      <PageHeader title="Sem permissão" />
      <p className="empty">Você pode ver esta área, mas não alterar o que há nela.</p>
    </div>
  );
}

/**
 * Página de edição aberta por quem só pode ler: os campos ficam desabilitados e os botões de
 * gravar somem (o estilo está em `.readonly-scope`). A API continua recusando a escrita (403).
 */
export function ReadOnlyScope({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  if (!readOnly) return <>{children}</>;
  return (
    <fieldset className="readonly-scope" disabled>
      {children}
    </fieldset>
  );
}
