import {
  SeatingTableInput,
  type SeatGuestView,
  type SeatingTableView,
  type SeatingView,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../../api.ts";
import { useCan } from "../../event.tsx";
import { eh } from "../../nav.ts";
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
import { MesasImprimir } from "./MesasImprimir.tsx";
import "./mesas.css";

/*
 * Mapa de mesas em lista (#/mesas, impressão em #/mesas/imprimir): mesas com lugares, lado e
 * grupo; distribuição por pessoa (só confirmados por padrão); aviso de lotação, nunca bloqueio.
 */

type Change = { guestId: number; tableId: number | null };

export function Mesas() {
  // O App.tsx entrega "#/e/:id/mesas[/imprimir]" a esta página: o subcaminho é lido aqui.
  if (/\/mesas\/imprimir\/?$/.test(window.location.hash)) return <MesasImprimir />;
  return <MesasLista />;
}

const free = (t: SeatingTableView) => t.seats - t.guests.length;

function MesasLista() {
  const canWrite = useCan("seating.write");
  const toast = useToast();
  const [showPending, setShowPending] = useState(false);
  const [side, setSide] = useState("");
  const [search, setSearch] = useState("");
  const { data, error, loading, reload } = useLoad(
    () => api<SeatingView>(showPending ? "/seating?all=1" : "/seating"),
    [showPending],
  );
  const [editing, setEditing] = useState<SeatingTableView | "new" | null>(null);
  const [removing, setRemoving] = useState<SeatingTableView | null>(null);
  const [swapping, setSwapping] = useState<SeatGuestView | null>(null);
  const [auto, setAuto] = useState<Change[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Sem dados."} onRetry={reload} />;

  const sideLabel = (key: string | null) =>
    key ? (data.sides.find((s) => s.key === key)?.label ?? key) : null;
  const q = search.trim().toLocaleLowerCase("pt-BR");
  const matches = (g: SeatGuestView) =>
    (!side || g.side === side) &&
    (!q ||
      g.name.toLocaleLowerCase("pt-BR").includes(q) ||
      g.invitationLabel.toLocaleLowerCase("pt-BR").includes(q));
  const visibleTables = data.tables.filter((t) => !side || t.side === null || t.side === side);
  const unassigned = data.unassigned.filter(matches);
  const seatedNotConfirmed = data.tables.flatMap((t) =>
    t.guests.filter((g) => g.rsvpStatus !== "confirmed").map((g) => ({ g, table: t })),
  );

  const groups = new Map<number, SeatGuestView[]>();
  for (const g of unassigned)
    groups.set(g.invitationId, [...(groups.get(g.invitationId) ?? []), g]);

  async function run(changes: Change[], ok?: string) {
    setBusy(true);
    try {
      await send("PUT", "/seating/assignments", {
        assignments: changes.map((c) => ({ ...c, seat: null })),
      });
      if (ok) toast(ok);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
      reload();
    }
  }

  const place = (guests: SeatGuestView[], value: string) => {
    if (busy) return;
    const tableId = value === "" ? null : Number(value);
    const table = data.tables.find((t) => t.id === tableId);
    void run(
      guests.map((g) => ({ guestId: g.guestId, tableId })),
      table && guests.length > free(table)
        ? `${table.name} passa dos ${table.seats} lugares. Confira a lotação.`
        : undefined,
    );
  };

  /** Mesas na ordem, convites inteiros juntos, só onde o lado combina e ainda cabe. */
  function planAuto(): Change[] {
    const room = new Map(data!.tables.map((t) => [t.id, free(t)]));
    const out: Change[] = [];
    for (const people of groups.values()) {
      const table = data!.tables.find(
        (t) =>
          (t.side === null || t.side === people[0]!.side) && (room.get(t.id) ?? 0) >= people.length,
      );
      if (!table) continue;
      room.set(table.id, room.get(table.id)! - people.length);
      for (const g of people) out.push({ guestId: g.guestId, tableId: table.id });
    }
    return out;
  }

  async function removeTable() {
    if (!removing) return;
    setBusy(true);
    try {
      await send("DELETE", `/seating/tables/${removing.id}`);
      toast(`${removing.name} apagada. As pessoas voltaram para "sem mesa".`);
      setRemoving(null);
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function move(table: SeatingTableView, delta: -1 | 1) {
    const ids = data!.tables.map((t) => t.id);
    const i = ids.indexOf(table.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try {
      await send("PUT", "/seating/tables/order", { ids });
      reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const tableOptions = data.tables.map((t) => (
    <option key={t.id} value={t.id}>
      {t.name} ({Math.max(free(t), 0)} livres)
    </option>
  ));

  return (
    <div className="stack stack--lg mesas">
      <PageHeader
        title="Mesas"
        subtitle="Monte as mesas e distribua as pessoas confirmadas. Passar dos lugares só gera um aviso."
        actions={
          <>
            <a className="button button--ghost" href={eh("/mesas/imprimir")}>
              Imprimir
            </a>
            {canWrite && (
              <button className="button" onClick={() => setEditing("new")}>
                Nova mesa
              </button>
            )}
          </>
        }
      />

      <dl className="tally">
        <div>
          <dt>Mesas</dt>
          <dd>{data.stats.tables}</dd>
        </div>
        <div>
          <dt>Lugares</dt>
          <dd>{data.stats.seats}</dd>
        </div>
        <div>
          <dt>Confirmados</dt>
          <dd>{data.stats.confirmed}</dd>
        </div>
        <div>
          <dt>Sentados</dt>
          <dd>{data.stats.seated}</dd>
        </div>
        <div>
          <dt>Sem mesa</dt>
          <dd>{data.unassigned.filter((g) => g.rsvpStatus === "confirmed").length}</dd>
        </div>
      </dl>

      {seatedNotConfirmed.length > 0 && (
        <div className="alert alert--info" role="status">
          <strong>
            {seatedNotConfirmed.length === 1
              ? "1 pessoa sentada não confirmou presença:"
              : `${seatedNotConfirmed.length} pessoas sentadas não confirmaram presença:`}
          </strong>{" "}
          {seatedNotConfirmed.map(({ g, table }) => `${g.name} (${table.name})`).join(", ")}. Tire
          do mapa se não vierem.
        </div>
      )}

      <div className="mesas__filters">
        <Field label="Buscar pessoa ou convite">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome…"
          />
        </Field>
        <Field label="Lado ou grupo">
          <select value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="">Todos</option>
            {data.sides.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="check mesas__check">
          <input
            type="checkbox"
            checked={showPending}
            onChange={(e) => setShowPending(e.target.checked)}
          />
          <span>Mostrar quem ainda não respondeu</span>
        </label>
      </div>

      <div className="mesas__board">
        <section className="card stack" aria-labelledby="sem-mesa">
          <div className="card__head">
            <h2 id="sem-mesa">Sem mesa ({unassigned.length})</h2>
            {canWrite && data.tables.length > 0 && groups.size > 0 && (
              <button
                className="button button--small button--ghost"
                disabled={busy}
                onClick={() => {
                  const plan = planAuto();
                  if (plan.length === 0) toast("Nenhum convite cabe nas mesas livres.", "error");
                  else setAuto(plan);
                }}
              >
                Distribuir automático
              </button>
            )}
          </div>
          {unassigned.length === 0 ? (
            <p className="empty">
              {data.stats.confirmed === 0
                ? "Ninguém confirmou ainda."
                : "Todo mundo que aparece aqui já tem mesa."}
            </p>
          ) : (
            [...groups.values()].map((people) => (
              <div key={people[0]!.invitationId} className="mesas__group">
                <div className="mesas__group-head">
                  <strong>{people[0]!.invitationLabel}</strong>
                  <span className="muted small">{sideLabel(people[0]!.side)}</span>
                  {canWrite && people.length > 1 && data.tables.length > 0 && (
                    <select
                      aria-label={`Sentar todo o convite ${people[0]!.invitationLabel}`}
                      value=""
                      disabled={busy}
                      onChange={(e) => place(people, e.target.value)}
                    >
                      <option value="">Sentar todos…</option>
                      {tableOptions}
                    </select>
                  )}
                </div>
                <ul className="mesas__people">
                  {people.map((g) => (
                    <li key={g.guestId} className="mesas__person">
                      <PersonName g={g} />
                      {canWrite && (
                        <select
                          aria-label={`Mesa de ${g.name}`}
                          value=""
                          disabled={busy || data.tables.length === 0}
                          onChange={(e) => place([g], e.target.value)}
                        >
                          <option value="">Escolher mesa…</option>
                          {tableOptions}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <div className="mesas__tables">
          {visibleTables.length === 0 ? (
            <p className="empty">
              {data.tables.length === 0
                ? `Nenhuma mesa ainda.${canWrite ? " Comece por “Nova mesa”." : ""}`
                : "Nenhuma mesa para esse lado."}
            </p>
          ) : (
            visibleTables.map((t) => (
              <section
                key={t.id}
                className={`card stack mesas__table${t.overCapacity ? " mesas__table--over" : ""}`}
                aria-label={t.name}
              >
                <div className="card__head">
                  <h2>{t.name}</h2>
                  <span className="mesas__count">
                    {t.guests.length}/{t.seats}
                  </span>
                </div>
                <p className="row__meta">
                  {[sideLabel(t.side), t.groupLabel, t.notes].filter(Boolean).join(" · ") ||
                    "Qualquer lado"}
                </p>
                {t.overCapacity && (
                  <p className="alert alert--error" role="status">
                    Lotada: {t.guests.length - t.seats}{" "}
                    {t.guests.length - t.seats === 1 ? "pessoa a mais" : "pessoas a mais"} do que os{" "}
                    {t.seats} lugares.
                  </p>
                )}
                {t.guests.length === 0 ? (
                  <p className="empty">Mesa vazia.</p>
                ) : (
                  <ul className="mesas__people">
                    {t.guests.map((g) => (
                      <li key={g.guestId} className="mesas__person">
                        <PersonName g={g} table={t} />
                        {canWrite && (
                          <div className="mesas__move">
                            <select
                              aria-label={`Mudar ${g.name} de mesa`}
                              value={t.id}
                              disabled={busy}
                              onChange={(e) => place([g], e.target.value)}
                            >
                              <option value="">Tirar da mesa</option>
                              {tableOptions}
                            </select>
                            <button
                              className="button button--small button--ghost"
                              onClick={() => setSwapping(g)}
                              aria-label={`Trocar ${g.name} com outra pessoa`}
                            >
                              Trocar
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite && (
                  <div className="actions mesas__actions">
                    <button
                      className="button button--small button--ghost"
                      onClick={() => setEditing(t)}
                    >
                      Editar
                    </button>
                    <button
                      className="button button--small button--ghost"
                      onClick={() => void move(t, -1)}
                      aria-label={`Subir ${t.name}`}
                      disabled={data.tables[0]?.id === t.id}
                    >
                      ↑
                    </button>
                    <button
                      className="button button--small button--ghost"
                      onClick={() => void move(t, 1)}
                      aria-label={`Descer ${t.name}`}
                      disabled={data.tables.at(-1)?.id === t.id}
                    >
                      ↓
                    </button>
                    <button
                      className="button button--small button--danger-ghost"
                      onClick={() => setRemoving(t)}
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      </div>

      <TableForm
        key={editing === null ? "none" : editing === "new" ? "new" : editing.id}
        table={editing}
        sides={data.sides}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <SwapModal
        key={swapping?.guestId ?? 0}
        guest={swapping}
        tables={data.tables}
        onClose={() => setSwapping(null)}
        onSwap={(a, b) => {
          setSwapping(null);
          void run(
            [
              { guestId: a.guestId, tableId: b.tableId },
              { guestId: b.guestId, tableId: a.tableId },
            ],
            `${a.name} e ${b.name} trocaram de mesa.`,
          );
        }}
      />

      <Confirm
        open={removing !== null}
        title="Excluir mesa"
        confirmLabel="Excluir mesa"
        danger
        busy={busy}
        onConfirm={() => void removeTable()}
        onCancel={() => setRemoving(null)}
      >
        <p>
          Excluir <strong>{removing?.name}</strong>? As {removing?.guests.length ?? 0} pessoas dela
          voltam para “sem mesa”.
        </p>
      </Confirm>

      <Confirm
        open={auto !== null}
        title="Distribuir automaticamente"
        confirmLabel="Distribuir"
        busy={busy}
        onConfirm={() => {
          const plan = auto!;
          setAuto(null);
          void run(plan, `${plan.length} pessoas sentadas.`);
        }}
        onCancel={() => setAuto(null)}
      >
        <p>
          Sentar {auto?.length} das {unassigned.length} pessoas sem mesa, mantendo cada convite
          junto e respeitando o lado das mesas. Quem não couber continua em “sem mesa”.
        </p>
      </Confirm>
    </div>
  );
}

function PersonName({ g, table }: { g: SeatGuestView; table?: SeatingTableView }) {
  return (
    <span className="mesas__name">
      <span>
        {g.name}
        {g.seat !== null && <span className="muted"> · lugar {g.seat}</span>}
      </span>
      <span className="mesas__tags">
        {g.isChild && <Badge tone="info">Criança</Badge>}
        {g.isPlusOne && <Badge tone="muted">Acompanhante</Badge>}
        {g.rsvpStatus === "pending" && <Badge tone="warn">Sem resposta</Badge>}
        {g.rsvpStatus === "declined" && <Badge tone="error">Recusou</Badge>}
        {table && table.side && g.side !== table.side && <Badge tone="warn">Outro lado</Badge>}
      </span>
    </span>
  );
}

type Seated = { guestId: number; name: string; tableId: number };

function SwapModal({
  guest,
  tables,
  onClose,
  onSwap,
}: {
  guest: SeatGuestView | null;
  tables: SeatingTableView[];
  onClose: () => void;
  onSwap: (a: Seated, b: Seated) => void;
}) {
  const [other, setOther] = useState("");
  const here = guest ? tables.find((t) => t.guests.some((g) => g.guestId === guest.guestId)) : null;
  const candidates = tables
    .filter((t) => t.id !== here?.id)
    .flatMap((t) => t.guests.map((g) => ({ g, t })));
  const picked = candidates.find((c) => String(c.g.guestId) === other);
  return (
    <Modal title="Trocar de mesa" open={guest !== null} onClose={onClose}>
      {guest && here && (
        <div className="stack">
          <p>
            <strong>{guest.name}</strong> está em {here.name}. Com quem trocar de lugar?
          </p>
          <Field label="Pessoa de outra mesa">
            <select value={other} onChange={(e) => setOther(e.target.value)}>
              <option value="">Escolher…</option>
              {candidates.map(({ g, t }) => (
                <option key={g.guestId} value={g.guestId}>
                  {g.name} ({t.name})
                </option>
              ))}
            </select>
          </Field>
          <div className="actions actions--end">
            <button className="button button--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="button"
              disabled={!picked}
              onClick={() =>
                picked &&
                onSwap(
                  { guestId: guest.guestId, name: guest.name, tableId: here.id },
                  { guestId: picked.g.guestId, name: picked.g.name, tableId: picked.t.id },
                )
              }
            >
              Trocar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TableForm({
  table,
  sides,
  onClose,
  onSaved,
}: {
  table: SeatingTableView | "new" | null;
  sides: { key: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const current = table && table !== "new" ? table : null;
  const [name, setName] = useState(current?.name ?? "");
  const [seats, setSeats] = useState(String(current?.seats ?? 8));
  const [side, setSide] = useState(current?.side ?? "");
  const [group, setGroup] = useState(current?.groupLabel ?? "");
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = SeatingTableInput.safeParse({
      name,
      seats: Number(seats),
      side: side || null,
      groupLabel: group,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (current) await send("PATCH", `/seating/tables/${current.id}`, parsed.data);
      else await send("POST", "/seating/tables", parsed.data);
      toast(current ? "Mesa atualizada." : "Mesa criada.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={current ? "Editar mesa" : "Nova mesa"} open={table !== null} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <FormError message={error} />
        <Field label="Nome">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required />
        </Field>
        <Field label="Lugares" hint="Passar disso só mostra um aviso de lotação.">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Lado ou grupo da mesa"
          hint="Opcional. Ajuda a sentar cada convite no lugar certo."
        >
          <select value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="">Qualquer</option>
            {sides.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rótulo (opcional)" hint="Ex.: Amigos da faculdade.">
          <input value={group} onChange={(e) => setGroup(e.target.value)} maxLength={64} />
        </Field>
        <Field label="Observação (opcional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
        </Field>
        <div className="actions actions--end">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
