import { eventTypeOf, EVENT_TYPE_LABELS, type OrgEventSummary } from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { formatBRL, formatDate, plural } from "../../format.ts";
import { eventPath, oh } from "../../nav.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  Modal,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";
import { useRefreshMe } from "../../org.tsx";

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

/** Data ("AAAA-MM-DD") e hora ("HH:MM") de um instante no fuso do evento. */
function localParts(iso: string | null, timeZone: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "16:00" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts["year"]}-${parts["month"]}-${parts["day"]}`,
    time: `${parts["hour"]}:${parts["minute"]}`,
  };
}

/** Data, hora e fuso do evento (mesmo efeito de mudar a data em Configurações do evento). */
function ScheduleForm({
  event,
  onCancel,
  onSaved,
}: {
  event: OrgEventSummary;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initial = localParts(event.startsAt, event.timezone);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [timezone, setTimezone] = useState(event.timezone);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await orgSend("PATCH", `/events/${event.id}/schedule`, { date, time, timezone });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
      <p className="muted small">
        Os prazos das tarefas contados a partir da data do evento são recalculados, e o site mostra
        a data nova na hora.
      </p>
      <div className="form-grid">
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Hora de início">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
        <Field label="Fuso horário" hint="Ex.: America/Sao_Paulo.">
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
        </Field>
      </div>
      <FormError message={error} />
      <div className="actions actions--end">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar data"}
        </button>
      </div>
    </form>
  );
}

export function OrgEventos() {
  const toast = useToast();
  const refreshMe = useRefreshMe();
  const { data, error, loading, reload } = useLoad(
    () => orgApi<{ events: OrgEventSummary[] }>("/events"),
    [],
  );
  const [scheduling, setScheduling] = useState<OrgEventSummary | null>(null);
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
      // O status aparece também na lista de eventos e no seletor (vêm do /me).
      void refreshMe().catch(() => undefined);
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
                <button
                  className="button button--small button--ghost"
                  onClick={() => setScheduling(e)}
                  aria-label={`Data e fuso de ${e.name}`}
                >
                  Data
                </button>
                <a
                  className="button button--small button--ghost"
                  href={oh(`/eventos/${e.id}/dominios`)}
                >
                  Domínios
                </a>
                {e.status === "archived" && (
                  <a
                    className="button button--small button--danger-ghost"
                    href={oh(`/eventos/${e.id}/apagar`)}
                  >
                    Apagar…
                  </a>
                )}
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
      <Modal
        title={scheduling ? `Data de ${scheduling.name}` : "Data do evento"}
        open={scheduling !== null}
        onClose={() => setScheduling(null)}
      >
        {scheduling && (
          <ScheduleForm
            key={scheduling.id}
            event={scheduling}
            onCancel={() => setScheduling(null)}
            onSaved={() => {
              toast(`Data de ${scheduling.name} atualizada.`, "ok");
              setScheduling(null);
              reload();
              void refreshMe().catch(() => undefined);
            }}
          />
        )}
      </Modal>
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
