import {
  CHECKIN_PIN_LENGTH,
  CHECKIN_POLL_MS,
  type CheckinArrivalResult,
  type CheckinLookupResult,
  type CheckinSessionResult,
  type CheckinTotals,
} from "@casamento/shared";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiFailure, errorMessage } from "../../api.ts";
import { FormError } from "../../ui.tsx";
import { Desk, Totals, type DeskApi } from "../checkin/Desk.tsx";
import "../checkin/checkin.css";

/*
 * Fase 7, frente A (docs/saas/fase-7.md): portaria, sem conta, em `/portaria/#<token>` no host
 * da API (mesmo build do painel; o App.tsx abre esta página pelo `location.pathname`). PIN →
 * sessão (Bearer) → leitor de QR pela câmera (`BarcodeDetector` quando existir; senão digitação
 * ou busca por nome) → marcar chegada (parcial) e desfazer, com contagem por polling.
 *
 * O token fica no fragmento (não vai ao servidor nem ao log); a sessão fica no sessionStorage
 * desta aba (some ao fechar). Nada de cookie: a API recebe `Authorization: Bearer`.
 */

const STORE_KEY = "portaria:sessao";

type Stored = CheckinSessionResult & { token: string };

function loadStored(token: string): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (s.token !== token || Date.parse(s.expiresAt) <= Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

function saveStored(s: Stored | null) {
  try {
    if (s) sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    // Navegação privada sem storage: a sessão vale até recarregar a página.
  }
}

async function call<T>(path: string, init: RequestInit & { session?: string } = {}): Promise<T> {
  const { session, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api/checkin${path}`, {
      ...rest,
      credentials: "omit",
      headers: {
        accept: "application/json",
        ...(rest.body ? { "content-type": "application/json" } : {}),
        ...(session ? { authorization: `Bearer ${session}` } : {}),
      },
    });
  } catch {
    throw new ApiFailure(0, "Sem conexão. Confira a internet e tente de novo.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `Algo deu errado (erro ${res.status}). Tente de novo.`;
    throw new ApiFailure(res.status, message);
  }
  return body as T;
}

const tokenFromHash = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, "")).trim();

export function Portaria() {
  const [token, setToken] = useState(tokenFromHash);
  const [session, setSession] = useState<Stored | null>(() => loadStored(tokenFromHash()));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      const t = tokenFromHash();
      setToken(t);
      setSession(loadStored(t));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const lost = useCallback((message: string) => {
    saveStored(null);
    setSession(null);
    setNotice(message);
  }, []);

  if (!token) {
    return (
      <main className="shell shell--center">
        <section className="card card--narrow stack">
          <h1>Portaria</h1>
          <p>
            Abra o link completo que a organização do evento mandou: ele termina com um código
            depois do “#”.
          </p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <PinForm
        token={token}
        notice={notice}
        onOpen={(s) => {
          const stored = { ...s, token };
          saveStored(stored);
          setNotice(null);
          setSession(stored);
        }}
      />
    );
  }

  return (
    <Gate
      session={session}
      onLost={lost}
      onLeave={() => {
        saveStored(null);
        setSession(null);
        setNotice("Você saiu. Para voltar, digite o PIN de novo.");
      }}
    />
  );
}

function PinForm({
  token,
  notice,
  onOpen,
}: {
  token: string;
  notice: string | null;
  onOpen: (s: CheckinSessionResult) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!new RegExp(`^\\d{${CHECKIN_PIN_LENGTH}}$`).test(pin)) {
      setError(`O PIN tem ${CHECKIN_PIN_LENGTH} números.`);
      return;
    }
    setBusy(true);
    try {
      onOpen(
        await call<CheckinSessionResult>("/session", {
          method: "POST",
          body: JSON.stringify({ token, pin }),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell shell--center">
      <form className="card card--narrow stack portaria-pin" onSubmit={onSubmit}>
        <h1>Portaria</h1>
        <p className="muted">Digite o PIN de {CHECKIN_PIN_LENGTH} números que veio com o link.</p>
        {notice && <p className="alert alert--info">{notice}</p>}
        <label className="field">
          <span className="field__label">PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, CHECKIN_PIN_LENGTH))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={CHECKIN_PIN_LENGTH}
            autoFocus
            aria-invalid={error ? true : undefined}
          />
        </label>
        <FormError message={error} />
        <button className="button button--block" disabled={busy}>
          {busy ? "Conferindo…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

function Gate({
  session,
  onLost,
  onLeave,
}: {
  session: Stored;
  onLost: (message: string) => void;
  onLeave: () => void;
}) {
  const [totals, setTotals] = useState<CheckinTotals | null>(null);

  /** Chamada com a sessão; 401 = link revogado/vencido ou sessão acabou → volta ao PIN. */
  const authed = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      try {
        return await call<T>(path, { ...init, session: session.session });
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 401) onLost(e.message);
        throw e;
      }
    },
    [session.session, onLost],
  );

  useEffect(() => {
    let alive = true;
    const load = () =>
      authed<CheckinTotals>("/summary")
        .then((t) => alive && setTotals(t))
        .catch(() => undefined);
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, CHECKIN_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [authed]);

  const deskApi = useMemo<DeskApi>(
    () => ({
      lookup: (query) =>
        authed<CheckinLookupResult>(
          `/lookup?${new URLSearchParams(query as Record<string, string>)}`,
        ),
      arrive: (ref, people) =>
        authed<CheckinArrivalResult>("/arrivals", {
          method: "POST",
          body: JSON.stringify({ ref, people }),
        }),
      undo: (id) =>
        authed<CheckinArrivalResult>(`/arrivals/${id}/undo`, { method: "POST", body: "{}" }),
    }),
    [authed],
  );

  return (
    <main className="portaria">
      <header className="portaria__top">
        <div>
          <h1>{session.event.name}</h1>
          <p className="muted small">Portaria · {session.linkLabel}</p>
        </div>
        <button className="button button--ghost button--small" onClick={onLeave}>
          Sair
        </button>
      </header>
      <Totals totals={totals} />
      <Desk api={deskApi} canManage onTotals={setTotals} />
      <p className="muted small">
        A contagem se atualiza sozinha. Aqui aparecem só nomes, mesa e avisos do convite.
      </p>
    </main>
  );
}
