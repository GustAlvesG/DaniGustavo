import {
  CHECKIN_SEARCH_MIN,
  invitationTokenFromCode,
  type CheckinArrivalResult,
  type CheckinInvitationView,
  type CheckinLookupResult,
  type CheckinTotals,
} from "@casamento/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "../../api.ts";
import { formatDateTime, plural } from "../../format.ts";
import { Loading, useToast } from "../../ui.tsx";
import { canScanQr, Scanner } from "./Scanner.tsx";
import "./checkin.css";

/*
 * Fase 7, frente A: balcão do check-in, o mesmo no painel e na portaria (só muda quem chama a
 * API). Busca por nome ou código (o QR traz a URL `/c/<token>`), câmera quando o navegador lê
 * QR, chegada parcial (padrão: quem falta) e desfazer.
 */

export interface DeskApi {
  lookup(query: { code: string } | { q: string }): Promise<CheckinLookupResult>;
  arrive(ref: string, people: number): Promise<CheckinArrivalResult>;
  undo(arrivalId: number): Promise<CheckinArrivalResult>;
}

/** Contagem do evento (chegaram × confirmados), com barra. */
export function Totals({ totals }: { totals: CheckinTotals | null }) {
  if (!totals) return null;
  const pct = totals.expectedPeople
    ? Math.min(100, (totals.arrivedPeople / totals.expectedPeople) * 100)
    : 0;
  return (
    <section className="card checkin-totals" aria-label="Contagem de chegadas">
      <p className="checkin-totals__big" aria-live="polite">
        <strong>{totals.arrivedPeople}</strong>
        <span> de {plural(totals.expectedPeople, "pessoa confirmada", "pessoas confirmadas")}</span>
      </p>
      <div className="meter" aria-hidden="true">
        <span className="meter__ok" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        Convites: {totals.arrivedInvitations} de {totals.expectedInvitations} já chegaram.
      </p>
    </section>
  );
}

export function Desk({
  api,
  canManage,
  onTotals,
}: {
  api: DeskApi;
  canManage: boolean;
  onTotals?: (totals: CheckinTotals) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [results, setResults] = useState<CheckinInvitationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSupported, setScanSupported] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    void canScanQr().then(setScanSupported);
  }, []);

  const run = useCallback(
    async (value: string) => {
      const query = value.trim();
      const token = invitationTokenFromCode(query);
      if (!token && query.length < CHECKIN_SEARCH_MIN) {
        setResults(null);
        setError(null);
        return;
      }
      const mine = ++seq.current;
      setSearching(true);
      try {
        const res = await api.lookup(token ? { code: query } : { q: query });
        if (mine !== seq.current) return;
        setResults(res.invitations);
        setError(null);
      } catch (e) {
        if (mine !== seq.current) return;
        setResults(null);
        setError(errorMessage(e));
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    },
    [api],
  );

  // Busca enquanto digita (com uma pausa curta para não chamar a cada letra).
  useEffect(() => {
    const t = setTimeout(() => void run(text), 300);
    return () => clearTimeout(t);
  }, [text, run]);

  const onScan = useCallback(
    (code: string) => {
      setScanning(false);
      setText(code);
      void run(code);
    },
    [run],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(text);
  }

  const replace = (r: CheckinArrivalResult) => {
    setResults((list) =>
      list ? list.map((i) => (i.ref === r.invitation.ref ? r.invitation : i)) : [r.invitation],
    );
    onTotals?.(r.totals);
  };

  async function arrive(inv: CheckinInvitationView, people: number) {
    try {
      const r = await api.arrive(inv.ref, people);
      replace(r);
      toast(`${inv.label}: ${plural(people, "chegada marcada", "chegadas marcadas")}.`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function undo(inv: CheckinInvitationView, arrivalId: number) {
    try {
      replace(await api.undo(arrivalId));
      toast(`${inv.label}: chegada desfeita.`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <section className="card stack" aria-labelledby="desk-title">
      <h2 id="desk-title">Encontrar convite</h2>
      <form className="checkin-search" onSubmit={onSubmit} role="search">
        <label className="field">
          <span className="field__label">Nome ou código do convite</span>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: Silva"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="search"
          />
        </label>
        <button type="submit" className="button">
          Buscar
        </button>
      </form>
      {scanSupported &&
        (scanning ? (
          <Scanner onCode={onScan} onClose={() => setScanning(false)} />
        ) : (
          <button type="button" className="button button--ghost" onClick={() => setScanning(true)}>
            Ler QR do convite pela câmera
          </button>
        ))}
      {!scanSupported && (
        <p className="muted small">
          Este navegador não lê QR pela câmera: digite o nome ou o código impresso no convite.
        </p>
      )}
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {searching && !results && <Loading label="Buscando…" />}
      {results && results.length === 0 && (
        <p className="empty">Nenhum convite encontrado com “{text.trim()}”.</p>
      )}
      {results && results.length > 0 && (
        <ul className="checkin-results" aria-busy={searching}>
          {results.map((inv) => (
            <InvitationCard
              key={inv.ref}
              inv={inv}
              canManage={canManage}
              onArrive={(n) => arrive(inv, n)}
              onUndo={(id) => undo(inv, id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InvitationCard({
  inv,
  canManage,
  onArrive,
  onUndo,
}: {
  inv: CheckinInvitationView;
  canManage: boolean;
  onArrive: (people: number) => Promise<void>;
  onUndo: (arrivalId: number) => Promise<void>;
}) {
  const missing = Math.max(0, inv.confirmed - inv.arrived);
  const [count, setCount] = useState(Math.max(1, missing));
  const [busy, setBusy] = useState(false);
  useEffect(() => setCount(Math.max(1, missing)), [missing]);
  const done = inv.confirmed > 0 && missing === 0;
  const over = inv.arrived + count > inv.confirmed;
  const active = inv.arrivals.filter((a) => !a.undoneAt);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="checkin-inv">
      <div className="checkin-inv__head">
        <h3>{inv.label}</h3>
        <span
          className={`badge badge--${done ? "ok" : inv.arrived > 0 ? "info" : "muted"}`}
          aria-label={`Chegaram ${inv.arrived} de ${inv.confirmed}`}
        >
          {inv.arrived}/{inv.confirmed}
        </span>
      </div>
      {inv.accessNote && (
        <p className="checkin-inv__note" role="note">
          <strong>Aviso:</strong> {inv.accessNote}
        </p>
      )}
      {inv.people.length === 0 ? (
        <p className="alert alert--error">Ninguém deste convite confirmou presença.</p>
      ) : (
        <ul className="checkin-people">
          {inv.people.map((p, i) => (
            <li key={i}>
              <span>
                {p.name}
                {p.isChild && <span className="muted small"> · criança</span>}
              </span>
              {p.table && <span className="badge badge--info">{p.table}</span>}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="checkin-mark">
          <div className="stepper" role="group" aria-label="Quantas pessoas chegaram agora">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setCount((n) => Math.max(1, n - 1))}
              disabled={count <= 1 || busy}
              aria-label="Uma pessoa a menos"
            >
              −
            </button>
            <output aria-live="polite">{count}</output>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setCount((n) => Math.min(100, n + 1))}
              disabled={busy}
              aria-label="Uma pessoa a mais"
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="button checkin-mark__go"
            disabled={busy}
            onClick={() => act(() => onArrive(count))}
          >
            {busy ? "Aguarde…" : `Marcar ${plural(count, "chegada", "chegadas")}`}
          </button>
        </div>
      )}
      {canManage && over && (
        <p className="checkin-warn small">
          {done
            ? "Este convite já chegou completo. Marque só se veio alguém a mais."
            : `Passa das ${inv.confirmed} pessoas confirmadas. Pode marcar, se for o caso.`}
        </p>
      )}
      {active.length > 0 && (
        <ul className="checkin-arrivals">
          {active.map((a) => (
            <li key={a.id}>
              <span className="small">
                {plural(a.people, "pessoa", "pessoas")} · {formatDateTime(a.at)} · {a.by}
              </span>
              {canManage && (
                <button
                  type="button"
                  className="button button--small button--ghost"
                  disabled={busy}
                  onClick={() => act(() => onUndo(a.id))}
                >
                  Desfazer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
