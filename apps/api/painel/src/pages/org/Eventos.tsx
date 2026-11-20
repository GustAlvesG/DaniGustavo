import { eventTypeOf, EVENT_TYPE_LABELS, type OrgEventSummary } from "@casamento/shared";
import { useState } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { formatBRL, formatDate, plural } from "../../format.ts";
import { eventPath, oh } from "../../nav.ts";
import { Badge, Confirm, ErrorBox, Loading, PageHeader, useLoad, useToast } from "../../ui.tsx";

export const EVENT_STATUS_LABEL: Record<OrgEventSummary["status"], string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};
const STATUS_TONE: Record<OrgEventSummary["status"], string> = {
  draft: "warn",
  active: "ok",
  archived: "muted",
};

export function EventStatusBadge({ status }: { status: OrgEventSummary["status"] }) {
  return <Badge tone={STATUS_TONE[status]}>{EVENT_STATUS_LABEL[status]}</Badge>;
}

/** Linha de evento: nome, tipo, data e números (usada no início e na lista). */
export function EventNumbers({ e }: { e: OrgEventSummary }) {
  return (
    <>
      <span className="row__title">{e.name}</span>
      <span className="row__meta">
        {EVENT_TYPE_LABELS[eventTypeOf(e.type)]} · {formatDate(e.startsAt)}
        {e.primaryHost ? ` · ${e.primaryHost}` : ""}
      </span>
      <span className="row__meta">
        {plural(e.confirmed, "confirmado", "confirmados")} de{" "}
        {plural(e.guests, "convidado", "convidados")} · presentes recebidos:{" "}
        {formatBRL(e.giftsReceivedCents)}
      </span>
    </>
  );
}

export function OrgEventos() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => orgApi<{ events: OrgEventSummary[] }>("/events"),
    [],
  );
  const [pending, setPending] = useState<{
    event: OrgEventSummary;
    status: OrgEventSummary["status"];
  } | null>(null);

  async function change(event: OrgEventSummary, status: OrgEventSummary["status"]) {
    try {
      await orgSend("PATCH", `/events/${event.id}`, { status });
      toast(
        status === "active"
          ? `${event.name} está no ar.`
          : status === "archived"
            ? `${event.name} foi arquivado.`
            : `${event.name} voltou a rascunho.`,
        "ok",
      );
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Eventos"
        subtitle="Todos os eventos da organização."
        actions={
          <a className="button" href={oh("/eventos/novo")}>
            Novo evento
          </a>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : data && data.events.length === 0 ? (
        <p className="empty">Nenhum evento ainda. Crie o primeiro em “Novo evento”.</p>
      ) : (
        <ul className="rows" aria-busy={loading}>
          {data?.events.map((e) => (
            <li key={e.id} className="row">
              <a className="row__main" href={eventPath(e.id)}>
                <EventNumbers e={e} />
              </a>
              <div className="row__side">
                <EventStatusBadge status={e.status} />
                {e.status !== "active" && (
                  <button className="button button--small" onClick={() => void change(e, "active")}>
                    Ativar
                  </button>
                )}
                {e.status === "active" && (
                  <button
                    className="button button--small button--ghost"
                    onClick={() => void change(e, "draft")}
                  >
                    Tirar do ar
                  </button>
                )}
                {e.status !== "archived" && (
                  <button
                    className="button button--small button--ghost"
                    onClick={() => setPending({ event: e, status: "archived" })}
                  >
                    Arquivar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Confirm
        open={pending !== null}
        title="Arquivar evento?"
        confirmLabel="Arquivar"
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) void change(p.event, p.status);
        }}
        onCancel={() => setPending(null)}
      >
        <p>{pending?.event.name} sai do ar e fica guardado. Você pode ativá-lo de novo.</p>
      </Confirm>
    </div>
  );
}
