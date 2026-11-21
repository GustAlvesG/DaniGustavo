import {
  EVENT_TYPES,
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  type PlatformTaskTemplateView,
  type TaskTemplateInput,
  type TaskTemplateSummary,
  type TaskTemplateView,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { oh } from "../../nav.ts";
import {
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";

/* Fase 4, frente A: modelos de tarefas da organização (#/o/:orgId/modelos[/:id]). */

const TYPE_LABEL: Record<string, string> = {
  wedding: "Casamento",
  fifteen: "15 anos",
  birthday: "Aniversário",
  other: "Outro",
};
const typeLabel = (t: string | null) => (t ? (TYPE_LABEL[t] ?? t) : "Qualquer tipo");

export function ModelosTarefas({ id }: { id?: number }) {
  return id ? <ModeloEditor key={id} id={id} /> : <ModeloLista />;
}

function ModeloLista() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(
    () => orgApi<{ templates: TaskTemplateSummary[] }>("/task-templates"),
    [],
  );
  const platform = useLoad(
    () => orgApi<{ templates: PlatformTaskTemplateView[] }>("/platform-task-templates"),
    [],
  );
  const [removing, setRemoving] = useState<TaskTemplateSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState<number | null>(null);

  async function copyPlatform(t: PlatformTaskTemplateView) {
    setCopying(t.id);
    try {
      const r = await orgSend<{ template: TaskTemplateView }>(
        "POST",
        `/platform-task-templates/${t.id}/copy`,
      );
      toast(`“${t.name}” foi copiado para os modelos da organização.`);
      window.location.hash = oh(`/modelos/${r.template.id}`);
    } catch (err) {
      toast(errorMessage(err), "error");
      setCopying(null);
    }
  }

  async function create() {
    setCreating(true);
    try {
      const r = await orgSend<{ template: TaskTemplateView }>("POST", "/task-templates", {
        name: "Novo modelo",
        eventType: null,
        items: [],
      });
      window.location.hash = oh(`/modelos/${r.template.id}`);
    } catch (err) {
      toast(errorMessage(err), "error");
      setCreating(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await orgSend("DELETE", `/task-templates/${removing.id}`);
      toast("Modelo excluído. As tarefas já geradas continuam nos eventos.");
      setRemoving(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Modelos de tarefas"
        subtitle="Listas prontas por tipo de evento. Ao aplicar num evento, os prazos são contados a partir da data dele."
        actions={
          <button className="button" disabled={creating} onClick={() => void create()}>
            Novo modelo
          </button>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : null}
      {data && data.templates.length === 0 && (
        <p className="muted">Nenhum modelo ainda. Crie o primeiro e cadastre as tarefas dele.</p>
      )}
      {data && data.templates.length > 0 && (
        <ul className="rows">
          {data.templates.map((t) => (
            <li key={t.id} className="row" data-testid="modelo">
              <div className="row__main">
                <a className="row__title" href={oh(`/modelos/${t.id}`)}>
                  {t.name}
                </a>
                <span className="row__meta">
                  {typeLabel(t.eventType)} · {t.itemCount}{" "}
                  {t.itemCount === 1 ? "tarefa" : "tarefas"}
                </span>
              </div>
              <div className="row__side">
                <a className="button button--ghost button--small" href={oh(`/modelos/${t.id}`)}>
                  Editar
                </a>
                <button
                  className="button button--ghost button--small"
                  onClick={() => setRemoving(t)}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {platform.data && platform.data.templates.length > 0 && (
        <section className="stack" aria-labelledby="mod-plataforma">
          <div>
            <h2 id="mod-plataforma">Modelos prontos da plataforma</h2>
            <p className="muted small">
              Copie um para os modelos da organização e ajuste do seu jeito. Também dá para aplicar
              direto num evento, na página de tarefas dele.
            </p>
          </div>
          <ul className="rows">
            {platform.data.templates.map((t) => (
              <li key={t.id} className="row" data-testid="modelo-plataforma">
                <div className="row__main">
                  <span className="row__title">{t.name}</span>
                  <span className="row__meta">
                    {typeLabel(t.eventType)} · {t.items.length}{" "}
                    {t.items.length === 1 ? "tarefa" : "tarefas"}
                    {t.description ? ` · ${t.description}` : ""}
                  </span>
                </div>
                <div className="row__side">
                  <button
                    className="button button--small button--ghost"
                    disabled={copying !== null}
                    onClick={() => void copyPlatform(t)}
                  >
                    {copying === t.id ? "Copiando…" : "Copiar para a organização"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Confirm
        open={removing !== null}
        title="Excluir modelo"
        confirmLabel="Excluir"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      >
        <p>
          O modelo <strong>{removing?.name}</strong> some da organização. As tarefas que ele já
          gerou nos eventos continuam lá.
        </p>
      </Confirm>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

interface ItemDraft {
  key: number;
  title: string;
  description: string;
  category: TaskTemplateInput["items"][number]["category"];
  when: "before" | "on" | "after";
  /** Sempre positivo; o sentido vem de `when`. */
  days: string;
}

let draftKey = 0;
const newKey = () => ++draftKey;

function toDraft(i: TaskTemplateView["items"][number]): ItemDraft {
  return {
    key: newKey(),
    title: i.title,
    description: i.description ?? "",
    category: i.category,
    when: i.offsetDays < 0 ? "before" : i.offsetDays > 0 ? "after" : "on",
    days: String(Math.abs(i.offsetDays)),
  };
}

function ModeloEditor({ id }: { id: number }) {
  const { data, error, loading, reload } = useLoad(
    () => orgApi<{ template: TaskTemplateView }>(`/task-templates/${id}`),
    [id],
  );
  return (
    <div className="stack stack--lg">
      <a href={oh("/modelos")}>&larr; Modelos de tarefas</a>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : null}
      {data && <ModeloForm template={data.template} />}
    </div>
  );
}

function ModeloForm({ template }: { template: TaskTemplateView }) {
  const toast = useToast();
  const [name, setName] = useState(template.name);
  const [eventType, setEventType] = useState(template.eventType ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  const [items, setItems] = useState<ItemDraft[]>(template.items.map(toDraft));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = (key: number, changes: Partial<ItemDraft>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  const move = (index: number, delta: number) =>
    setItems((list) => {
      const next = [...list];
      const [moved] = next.splice(index, 1);
      next.splice(index + delta, 0, moved!);
      return next;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: TaskTemplateInput = {
      name,
      eventType: eventType || null,
      description: description.trim() || null,
      items: [],
    };
    for (const [i, it] of items.entries()) {
      const n = Number(it.days);
      if (it.when !== "on" && (!Number.isInteger(n) || n < 0)) {
        return setError(`Tarefa ${i + 1}: informe os dias com um número inteiro.`);
      }
      body.items.push({
        title: it.title,
        description: it.description.trim() || null,
        category: it.category,
        offsetDays: it.when === "on" ? 0 : it.when === "before" ? -n : n,
      });
    }
    setSaving(true);
    setError(null);
    try {
      const r = await orgSend<{ template: TaskTemplateView }>(
        "PUT",
        `/task-templates/${template.id}`,
        body,
      );
      setItems(r.template.items.map(toDraft));
      toast("Modelo salvo.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack stack--lg" onSubmit={submit} noValidate>
      <PageHeader
        title={template.name}
        subtitle="Cada tarefa tem um prazo contado a partir da data do evento."
      />
      <section className="card stack">
        <Field label="Nome do modelo">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={191} />
        </Field>
        <Field label="Serve para" hint="O modelo só aparece para eventos desse tipo.">
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="">Qualquer tipo de evento</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descrição (opcional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
      </section>

      <section className="stack">
        <h2>Tarefas ({items.length})</h2>
        {items.length === 0 && <p className="muted">Nenhuma tarefa ainda.</p>}
        {items.map((it, i) => (
          <div key={it.key} className="card stack" data-testid="modelo-item">
            <Field label={`Tarefa ${i + 1}`}>
              <input
                value={it.title}
                onChange={(e) => patch(it.key, { title: e.target.value })}
                maxLength={191}
              />
            </Field>
            <div className="grid grid--3">
              <Field label="Categoria">
                <select
                  value={it.category}
                  onChange={(e) =>
                    patch(it.key, { category: e.target.value as ItemDraft["category"] })
                  }
                >
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {TASK_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prazo">
                <select
                  value={it.when}
                  onChange={(e) => patch(it.key, { when: e.target.value as ItemDraft["when"] })}
                >
                  <option value="before">Dias antes do evento</option>
                  <option value="on">No dia do evento</option>
                  <option value="after">Dias depois do evento</option>
                </select>
              </Field>
              {it.when !== "on" && (
                <Field label="Quantos dias">
                  <input
                    value={it.days}
                    onChange={(e) => patch(it.key, { days: e.target.value })}
                    inputMode="numeric"
                  />
                </Field>
              )}
            </div>
            <Field label="Detalhes (opcional)">
              <input
                value={it.description}
                onChange={(e) => patch(it.key, { description: e.target.value })}
              />
            </Field>
            <div className="actions">
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                Subir
              </button>
              <button
                type="button"
                className="button button--ghost button--small"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                Descer
              </button>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}
              >
                Remover
              </button>
            </div>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="button button--ghost"
            onClick={() =>
              setItems((list) => [
                ...list,
                {
                  key: newKey(),
                  title: "",
                  description: "",
                  category: "geral",
                  when: "before",
                  days: "30",
                },
              ])
            }
          >
            Adicionar tarefa
          </button>
        </div>
      </section>

      <FormError message={error} />
      <div>
        <button className="button" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar modelo"}
        </button>
      </div>
    </form>
  );
}
