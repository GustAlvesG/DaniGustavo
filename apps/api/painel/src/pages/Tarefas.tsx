import {
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type ApplyTaskTemplateResult,
  type PlanningPerson,
  type TaskDue,
  type TaskInput,
  type TaskList,
  type TaskRow,
  type TaskStatus,
  type TaskTemplateSummary,
  type TaskView,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { useCan } from "../event.tsx";
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
} from "../ui.tsx";

/** Fase 4, frente A: checklist do evento (#/tarefas), com atrasadas, próximas e modelos. */

const TABS: { view: TaskView; label: string; count?: keyof TaskList["counts"] }[] = [
  { view: "open", label: "Abertas", count: "open" },
  { view: "overdue", label: "Atrasadas", count: "overdue" },
  { view: "upcoming", label: "Próximos 30 dias", count: "upcoming" },
  { view: "done", label: "Feitas", count: "done" },
  { view: "all", label: "Todas" },
];

/** "2030-01-31" → "31/01/2030" (data de calendário: sem fuso). */
const showDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem prazo");

function offsetText(days: number): string {
  if (days === 0) return "no dia do evento";
  const n = Math.abs(days);
  return `${n} ${n === 1 ? "dia" : "dias"} ${days < 0 ? "antes" : "depois"} do evento`;
}

function dueText(t: TaskRow): string {
  if (!t.dueOn) {
    return t.dueOffsetDays !== null
      ? `${offsetText(t.dueOffsetDays)} (evento sem data)`
      : "Sem prazo";
  }
  return t.dueOffsetDays !== null
    ? `${showDate(t.dueOn)} · ${offsetText(t.dueOffsetDays)}`
    : showDate(t.dueOn);
}

export function Tarefas() {
  const toast = useToast();
  const canWrite = useCan("tasks.write");
  const [view, setView] = useState<TaskView>("open");
  const { data, error, loading, reload } = useLoad(
    () => api<TaskList>(`/tasks?view=${view}`),
    [view],
  );
  const [editing, setEditing] = useState<TaskRow | "new" | null>(null);
  const [removing, setRemoving] = useState<TaskRow | null>(null);
  const [applying, setApplying] = useState(false);
  const [busy, setBusy] = useState(false);

  async function setStatus(t: TaskRow, status: TaskStatus) {
    try {
      await send("PATCH", `/tasks/${t.id}`, { status });
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await send("DELETE", `/tasks/${removing.id}`);
      toast("Tarefa excluída.");
      setRemoving(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function recalculate() {
    setBusy(true);
    try {
      const r = await send<{ updated: number }>("POST", "/tasks/recalculate");
      toast(
        r.updated === 0
          ? "Os prazos já estão de acordo com a data do evento."
          : `${r.updated} ${r.updated === 1 ? "prazo recalculado" : "prazos recalculados"}.`,
      );
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const hasRelative = data?.tasks.some((t) => t.dueOffsetDays !== null) ?? false;

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Tarefas"
        subtitle="O checklist do evento: o que falta, quem cuida e para quando."
        actions={
          canWrite ? (
            <>
              <button className="button button--ghost" onClick={() => setApplying(true)}>
                Aplicar modelo
              </button>
              <button className="button" onClick={() => setEditing("new")}>
                Nova tarefa
              </button>
            </>
          ) : undefined
        }
      />

      <div className="tabs" role="tablist" aria-label="Filtro das tarefas">
        {TABS.map((t) => (
          <button
            key={t.view}
            role="tab"
            className="tab"
            aria-selected={view === t.view}
            onClick={() => setView(t.view)}
          >
            {t.label}
            {t.count && data ? ` (${data.counts[t.count]})` : ""}
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : null}
      {data && data.tasks.length === 0 && (
        <p className="muted" data-testid="tarefas-vazio">
          {view === "all" || view === "open"
            ? "Nenhuma tarefa por aqui ainda. Crie uma ou aplique um modelo da organização."
            : "Nenhuma tarefa nesta lista."}
        </p>
      )}
      {data && data.tasks.length > 0 && (
        <ul className="rows">
          {data.tasks.map((t) => (
            <li key={t.id} className="row" data-testid="tarefa">
              <label className="check">
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  disabled={!canWrite}
                  onChange={(e) => void setStatus(t, e.target.checked ? "done" : "todo")}
                  aria-label={`Marcar "${t.title}" como feita`}
                />
              </label>
              <div className="row__main">
                <span
                  className={t.status === "done" ? "row__title row__title--done" : "row__title"}
                >
                  {t.title}
                </span>
                <span className="row__meta">
                  {TASK_CATEGORY_LABELS[t.category]} · {dueText(t)}
                  {t.assignee ? ` · ${t.assignee.name}` : ""}
                </span>
              </div>
              <div className="row__side">
                {t.overdue && <Badge tone="error">Atrasada</Badge>}
                {t.status === "doing" && <Badge tone="info">{TASK_STATUS_LABELS.doing}</Badge>}
                {canWrite && (
                  <>
                    <button
                      className="button button--ghost button--small"
                      onClick={() => setEditing(t)}
                    >
                      Editar
                    </button>
                    <button
                      className="button button--ghost button--small"
                      onClick={() => setRemoving(t)}
                    >
                      Excluir
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canWrite && hasRelative && (
        <section className="card stack">
          <p className="muted small">
            Mudou a data do evento? Os prazos relativos (&ldquo;30 dias antes&rdquo;) acompanham a
            nova data com um clique.
          </p>
          <div>
            <button
              className="button button--ghost"
              disabled={busy}
              onClick={() => void recalculate()}
            >
              Recalcular prazos pela data do evento
            </button>
          </div>
        </section>
      )}

      <Modal
        title={editing === "new" ? "Nova tarefa" : "Editar tarefa"}
        open={editing !== null}
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <TaskFields
            key={editing === "new" ? "nova" : `t${editing.id}`}
            task={editing === "new" ? null : editing}
            eventDate={data?.eventDate ?? null}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Modal>
      <ApplyTemplate
        open={applying}
        onClose={() => setApplying(false)}
        onApplied={() => {
          setApplying(false);
          setView("open");
          reload();
        }}
      />
      <Confirm
        open={removing !== null}
        title="Excluir tarefa"
        confirmLabel="Excluir"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      >
        <p>
          A tarefa <strong>{removing?.title}</strong> sai do checklist. Não dá para desfazer.
        </p>
      </Confirm>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

type DueKind = "none" | "date" | "before" | "after";

function dueToForm(t: TaskRow | null): { kind: DueKind; date: string; days: string } {
  if (!t) return { kind: "none", date: "", days: "30" };
  if (t.dueOffsetDays !== null) {
    return {
      kind: t.dueOffsetDays > 0 ? "after" : "before",
      date: t.dueOn ?? "",
      days: String(Math.abs(t.dueOffsetDays)),
    };
  }
  return { kind: t.dueOn ? "date" : "none", date: t.dueOn ?? "", days: "30" };
}

function TaskFields({
  task,
  eventDate,
  onSaved,
  onClose,
}: {
  task: TaskRow | null;
  eventDate: string | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const people = useLoad(() => api<{ people: PlanningPerson[] }>("/tasks/assignees"), []);
  const initial = dueToForm(task);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [category, setCategory] = useState<TaskInput["category"]>(task?.category ?? "geral");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [assignee, setAssignee] = useState(task?.assignee?.userId ?? "");
  const [kind, setKind] = useState<DueKind>(initial.kind);
  const [date, setDate] = useState(initial.date);
  const [days, setDays] = useState(initial.days);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    let due: TaskDue = null;
    if (kind === "date") {
      if (!date) return setError("Escolha a data do prazo.");
      due = { kind: "date", date };
    } else if (kind === "before" || kind === "after") {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 0) return setError("Informe os dias com um número inteiro.");
      due = { kind: "offset", days: kind === "before" ? -n : n };
    }
    const body = {
      title,
      description: description.trim() || null,
      category,
      status,
      assigneeUserId: assignee || null,
      due,
    };
    setSaving(true);
    setError(null);
    try {
      if (task) await send("PATCH", `/tasks/${task.id}`, body);
      else await send("POST", "/tasks", body);
      toast(task ? "Tarefa salva." : "Tarefa criada.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const known = people.data?.people.some((p) => p.userId === task?.assignee?.userId);
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Field label="Título">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={191} autoFocus />
      </Field>
      <Field label="Detalhes (opcional)">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>
      <div className="grid grid--2">
        <Field label="Categoria">
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TASK_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Situação">
          <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Responsável">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Sem responsável</option>
          {task?.assignee && people.data && !known && (
            <option value={task.assignee.userId}>{task.assignee.name} (fora da equipe)</option>
          )}
          {people.data?.people.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid--2">
        <Field label="Prazo">
          <select value={kind} onChange={(e) => setKind(e.target.value as DueKind)}>
            <option value="none">Sem prazo</option>
            <option value="date">Em uma data</option>
            <option value="before">Dias antes do evento</option>
            <option value="after">Dias depois do evento</option>
          </select>
        </Field>
        {kind === "date" && (
          <Field label="Data">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        {(kind === "before" || kind === "after") && (
          <Field
            label="Quantos dias"
            hint={
              eventDate
                ? `O evento é em ${showDate(eventDate)}.`
                : "O evento ainda não tem data: o prazo aparece quando ele tiver."
            }
          >
            <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
          </Field>
        )}
      </div>
      <FormError message={error} />
      <div className="actions actions--end">
        <button type="button" className="button button--ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="button" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------ */

function ApplyTemplate({
  open,
  onClose,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const toast = useToast();
  const { data, error, loading } = useLoad(
    () =>
      open
        ? api<{ templates: TaskTemplateSummary[] }>("/tasks/templates")
        : Promise.resolve({ templates: [] as TaskTemplateSummary[] }),
    [open],
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function apply(t: TaskTemplateSummary) {
    setBusy(t.id);
    setFailure(null);
    try {
      const r = await send<ApplyTaskTemplateResult>("POST", "/tasks/apply-template", {
        templateId: t.id,
      });
      toast(
        `${r.created} ${r.created === 1 ? "tarefa criada" : "tarefas criadas"} a partir de "${t.name}".`,
      );
      onApplied();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title="Aplicar modelo de tarefas" open={open} onClose={onClose}>
      <div className="stack">
        <p className="muted small">
          O modelo vira tarefas deste evento, com prazos contados a partir da data do evento.
          Aplicar de novo cria tarefas repetidas.
        </p>
        {loading && <Loading />}
        {error && <ErrorBox message={error} />}
        {data && data.templates.length === 0 && (
          <p className="muted">
            A organização ainda não tem modelos para este tipo de evento. Crie um em &ldquo;Modelos
            de tarefas&rdquo; no painel da organização.
          </p>
        )}
        <ul className="rows">
          {data?.templates.map((t) => (
            <li key={t.id} className="row" data-testid="modelo-aplicar">
              <div className="row__main">
                <span className="row__title">{t.name}</span>
                <span className="row__meta">
                  {t.itemCount} {t.itemCount === 1 ? "tarefa" : "tarefas"}
                  {t.description ? ` · ${t.description}` : ""}
                </span>
              </div>
              <div className="row__side">
                <button
                  className="button button--small"
                  disabled={busy !== null || t.itemCount === 0}
                  onClick={() => void apply(t)}
                >
                  {busy === t.id ? "Aplicando…" : "Aplicar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <FormError message={failure} />
      </div>
    </Modal>
  );
}
