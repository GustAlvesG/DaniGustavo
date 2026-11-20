import {
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  type EventType,
  type OrgEventSummary,
  type SlugCheck,
} from "@casamento/shared";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { eventPath, oh } from "../../nav.ts";
import { useRefreshMe } from "../../org.tsx";
import { Field, FormError, PageHeader, useToast } from "../../ui.tsx";

/** "Festa da Lia" vira "festa-da-lia" (sem acentos, só minúsculas, números e hífens). */
const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export function NovoEvento() {
  const toast = useToast();
  const refreshMe = useRefreshMe();
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("wedding");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("16:00");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [host, setHost] = useState("");
  const [check, setCheck] = useState<SlugCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  // Confere o endereço na hora (com uma pausa para não consultar a cada tecla).
  useEffect(() => {
    if (!slug) {
      setCheck(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      orgApi<SlugCheck>(`/events/slug-check?slug=${encodeURIComponent(slug)}`)
        .then((r) => alive && setCheck(r))
        .catch(() => alive && setCheck(null));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { event } = await orgSend<{ event: OrgEventSummary }>("POST", "/events", {
        name,
        type,
        slug,
        date,
        time,
        timezone,
        host: host.trim() || null,
      });
      toast("Evento criado como rascunho. Ative-o quando o site estiver pronto.", "ok");
      await refreshMe();
      window.location.hash = eventPath(event.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const slugTaken = check?.slug === slug && !check.available;

  return (
    <div className="stack stack--lg">
      <PageHeader title="Novo evento" subtitle="Nome, tipo, data, endereço e domínio do evento." />
      <form className="card stack" onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <Field label="Nome do evento">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={191}
              required
            />
          </Field>
          <Field label="Tipo">
            <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Horário">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
          <Field label="Fuso horário">
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
          </Field>
          <Field
            label="Endereço do evento"
            hint={
              check && check.slug === slug ? (
                check.available ? (
                  <span role="status">Disponível.</span>
                ) : (
                  <span role="alert">{check.message}</span>
                )
              ) : (
                "Letras minúsculas, números e hífens."
              )
            }
          >
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              maxLength={64}
              required
            />
          </Field>
          <Field label="Domínio próprio (opcional)" hint="Ex.: anaebruno.com.br">
            <input value={host} onChange={(e) => setHost(e.target.value)} maxLength={191} />
          </Field>
        </div>
        <FormError message={error} />
        <div className="actions actions--end">
          <a className="button button--ghost" href={oh("/eventos")}>
            Cancelar
          </a>
          <button className="button" disabled={busy || slugTaken}>
            {busy ? "Criando…" : "Criar evento"}
          </button>
        </div>
      </form>
    </div>
  );
}
