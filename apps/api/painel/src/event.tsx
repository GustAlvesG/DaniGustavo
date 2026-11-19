import { createContext, useContext } from "react";
import { formatDate } from "./format.ts";
import { eventPath } from "./nav.ts";
import { Badge, PageHeader } from "./ui.tsx";

/** Evento que o usuário pode abrir, como vem de GET /api/admin/me. */
export interface MeEvent {
  id: number;
  slug: string;
  name: string;
  /** wedding, fifteen, birthday ou other. */
  type: string;
  status: string;
  orgName: string;
  startsAt: string | null;
  role: "platform_admin" | "org_owner" | "org_member" | "event_host";
}

export interface MeResponse {
  user: { id: string; name: string; email: string };
  events: MeEvent[];
}

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

/** Lista de eventos (#/eventos): aparece só para quem tem acesso a mais de um. */
export function EventsPage({ events }: { events: MeEvent[] }) {
  return (
    <div className="stack stack--lg">
      <PageHeader title="Seus eventos" />
      <p className="muted">Escolha o evento que você quer administrar.</p>
      <ul className="rows">
        {events.map((e) => (
          <li key={e.id} className="row">
            <a className="row__main" href={eventPath(e.id)}>
              <span className="row__title">{e.name}</span>
              <span className="row__meta">
                {typeLabel(e.type)} · {e.startsAt ? formatDate(e.startsAt) : "Sem data"} ·{" "}
                {roleLabel(e.role)}
              </span>
            </a>
            <div className="row__side">
              <Badge tone={e.status}>{statusLabel(e.status)}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
