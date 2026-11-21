import {
  ScheduleItemInput,
  type EventVendorRow,
  type ScheduleItemRow,
  type ScheduleView,
} from "@casamento/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { useCan, useEvent } from "../event.tsx";
import { formatDate } from "../format.ts";
import {
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  Modal,
  PageHeader,
  useLoad,
  useToast,
} from "../ui.tsx";
import "../tools.css";

/* Roteiro do dia do evento (#/cronograma): horários no fuso do evento, impressão em A4. */

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export function Cronograma() {
  const ev = useEvent();
  const canWrite = useCan("schedule.write");
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<ScheduleView>("/schedule"), []);
  const [editing, setEditing] = useState<ScheduleItemRow | "new" | null>(null);
  const [removing, setRemoving] = useState<ScheduleItemRow | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Sem dados."} onRetry={reload} />;

  const days = new Map<string, ScheduleItemRow[]>();
  for (const item of data.items) days.set(item.date, [...(days.get(item.date) ?? []), item]);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await send("DELETE", `/schedule/${removing.id}`);
      toast("Atividade removida do cronograma.");
      setRemoving(null);
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <div className="no-print stack">
        <PageHeader
          title="Cronograma do dia"
          subtitle="O roteiro do evento, hora a hora. Os horários são os do local do evento."
          actions={
            <>
              <button
                className="button button--ghost"
                onClick={() => window.print()}
                disabled={data.items.length === 0}
              >
                Imprimir ou salvar PDF
              </button>
              {canWrite && (
                <button className="button" onClick={() => setEditing("new")}>
                  Nova atividade
                </button>
              )}
            </>
          }
        />
      </div>
      <header className="print-only">
        <h1>Cronograma · {ev.name}</h1>
      </header>

      {data.items.length === 0 ? (
        <p className="empty">
          Nenhuma atividade ainda.{canWrite ? " Comece por “Nova atividade”." : ""}
        </p>
      ) : (
        [...days].map(([date, items]) => (
          <section key={date} className="schedule-day" aria-label={dayLabel(date)}>
            <h2>{dayLabel(date)}</h2>
            <ul className="rows">
              {items.map((i) => (
                <li key={i.id} className="row schedule-item">
                  <span className="schedule-time">
                    {i.startTime}
                    {i.endTime ? ` – ${i.endTime}` : ""}
                  </span>
                  <div className="row__main">
                    <span className="row__title">{i.title}</span>
                    <span className="row__meta">
                      {[
                        i.location,
                        i.eventVendor ? `Fornecedor: ${i.eventVendor.name}` : null,
                        i.responsible ? `Responsável: ${i.responsible}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {i.details && <span className="row__meta">{i.details}</span>}
                  </div>
                  {canWrite && (
                    <div className="row__side no-print">
                      <button
                        className="button button--small button--ghost"
                        onClick={() => setEditing(i)}
                        aria-label={`Editar ${i.title}`}
                      >
                        Editar
                      </button>
                      <button
                        className="button button--small button--danger-ghost"
                        onClick={() => setRemoving(i)}
                        aria-label={`Excluir ${i.title}`}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Modal
        title={editing === "new" ? "Nova atividade" : "Editar atividade"}
        open={editing !== null}
        onClose={() => setEditing(null)}
        wide
      >
        {editing !== null && (
          <ItemForm
            item={editing === "new" ? null : editing}
            defaultDate={data.eventDate}
            onSaved={() => {
              setEditing(null);
              toast("Cronograma atualizado.");
              reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
      <Confirm
        open={removing !== null}
        title="Excluir atividade?"
        confirmLabel="Excluir"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      >
        <p>
          “{removing?.title}” sai do cronograma
          {removing ? ` (${formatDate(removing.startsAt)})` : ""}. Não dá para desfazer.
        </p>
      </Confirm>
    </div>
  );
}

function ItemForm({
  item,
  defaultDate,
  onSaved,
  onCancel,
}: {
  item: ScheduleItemRow | null;
  defaultDate: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(item?.date ?? defaultDate ?? "");
  const [startTime, setStartTime] = useState(item?.startTime ?? "");
  const [endTime, setEndTime] = useState(item?.endTime ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [responsible, setResponsible] = useState(item?.responsible ?? "");
  const [details, setDetails] = useState(item?.details ?? "");
  const [vendorId, setVendorId] = useState(item?.eventVendor ? String(item.eventVendor.id) : "");
  const [vendorList, setVendorList] = useState<EventVendorRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fornecedores do evento (frente B); se a rota falhar, o campo some em silêncio.
  useEffect(() => {
    let alive = true;
    api<{ vendors: EventVendorRow[] }>("/vendors")
      .then((r) => alive && setVendorList(r.vendors))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const parsed = ScheduleItemInput.safeParse({
      date: date || undefined,
      startTime,
      endTime: endTime || null,
      title,
      details,
      location,
      responsible,
      eventVendorId: vendorId ? Number(vendorId) : null,
    });
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? "Confira o formulário.");
    setSaving(true);
    try {
      if (item) await send("PATCH", `/schedule/${item.id}`, parsed.data);
      else await send("POST", "/schedule", parsed.data);
      onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit} noValidate>
      <Field label="Atividade" className="span-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={191} required />
      </Field>
      <Field label="Dia">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Início">
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          required
        />
      </Field>
      <Field label="Fim (opcional)" hint="Fim antes do início vale para o dia seguinte.">
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </Field>
      <Field label="Local">
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={191} />
      </Field>
      <Field label="Responsável">
        <input
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
          maxLength={191}
        />
      </Field>
      {vendorList.length > 0 && (
        <Field label="Fornecedor do evento">
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">Nenhum</option>
            {vendorList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Detalhes" className="span-2">
        <textarea
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={5000}
        />
      </Field>
      <div className="span-2">
        <FormError message={err} />
      </div>
      <div className="span-2 actions actions--end">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button" disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
