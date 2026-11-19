import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { apiRoot, SESSION_EXPIRED } from "./api.ts";
import { authClient, describeError } from "./auth-client.ts";
import { EventProvider, EventsPage, monogramOf, type MeEvent, type MeResponse } from "./event.tsx";
import { eh, goAbsolute, lastEvent, rememberEvent, setCurrentEventId } from "./nav.ts";
import { Configuracoes } from "./pages/Configuracoes.tsx";
import { Conta } from "./pages/Conta.tsx";
import { ConviteDetalhe, ConviteForm, Convites } from "./pages/Convites.tsx";
import { ConvitesQr } from "./pages/ConvitesQr.tsx";
import { Importar } from "./pages/Importar.tsx";
import { Listas } from "./pages/Listas.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Lembretes } from "./pages/Lembretes.tsx";
import { Pedidos } from "./pages/Pedidos.tsx";
import { Presentes } from "./pages/Presentes.tsx";
import { Recados } from "./pages/Recados.tsx";
import { ErrorBox, Loading, ToastProvider, useLoad } from "./ui.tsx";

/* ------------------------------------------------------------------------ */
/* Rotas por hash (#/e/3/convites/12): sem roteador, o servidor só entrega index */
/* ------------------------------------------------------------------------ */

function useHashPath(): string {
  const read = () => window.location.hash.replace(/^#/, "") || "/";
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}

const NAV = [
  { href: "/", label: "Início" },
  { href: "/convites", label: "Convites" },
  { href: "/presentes", label: "Presentes" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/recados", label: "Recados" },
  { href: "/lembretes", label: "Lembretes" },
  { href: "/configuracoes", label: "Configurações" },
];

/** "/e/3/convites?x=1" → { eventId: 3, rest: "/convites?x=1" }; outro caminho → null. */
function parseEventPath(path: string): { eventId: number; rest: string } | null {
  const m = /^\/e\/([1-9]\d{0,15})(\/.*)?$/.exec(path);
  return m ? { eventId: Number(m[1]), rest: m[2] ?? "/" } : null;
}

/** Página do evento; `path` é relativo a ele ("/convites/12"). */
function Page({ path }: { path: string }) {
  // "/convites/qr?ids=1,2": a parte depois do "?" vai para a página.
  const [route = "", query = ""] = path.split("?");
  const parts = route.split("/").filter(Boolean);
  const [section, id, extra] = parts;
  switch (section) {
    case undefined:
      return <Dashboard />;
    case "convites":
      if (id === "novo") return <ConviteForm />;
      if (id === "importar") return <Importar />;
      if (id === "qr") return <ConvitesQr query={query} />;
      if (id === "listas") return <Listas kind={extra ?? "buffet"} />;
      if (id && extra === "editar") return <ConviteForm id={Number(id)} />;
      if (id) return <ConviteDetalhe id={Number(id)} />;
      return <Convites />;
    case "presentes":
      return <Presentes />;
    case "pedidos":
      return <Pedidos openId={id} />;
    case "recados":
      return <Recados />;
    case "lembretes":
      return <Lembretes />;
    case "configuracoes":
      return <Configuracoes />;
    case "conta":
      return <Conta />;
    default:
      return (
        <div className="stack">
          <h1>Página não encontrada</h1>
          <a href={eh("/")}>Voltar ao início</a>
        </div>
      );
  }
}

/* ------------------------------------------------------------------------ */
/* App                                                                       */
/* ------------------------------------------------------------------------ */

export function App() {
  const { data, isPending, refetch } = authClient.useSession();
  // O Better Auth refaz a busca da sessão após o login; o "Carregando…" só na primeira carga.
  const [loaded, setLoaded] = useState(false);
  if (!isPending && !loaded) setLoaded(true);

  useEffect(() => {
    const on = () => void refetch();
    window.addEventListener(SESSION_EXPIRED, on);
    return () => window.removeEventListener(SESSION_EXPIRED, on);
  }, [refetch]);

  if (!loaded) {
    return (
      <main className="shell shell--center">
        <p className="muted">Carregando…</p>
      </main>
    );
  }

  return data ? (
    <ToastProvider>
      <Painel />
    </ToastProvider>
  ) : (
    <Login />
  );
}

/** Entrada: pergunta ao servidor quais eventos o usuário abre e decide para onde ir. */
function Painel() {
  const { data, error, loading, reload } = useLoad(() => apiRoot<MeResponse>("/me"), []);
  const path = useHashPath();

  if (loading && !data) {
    return (
      <main className="shell shell--center">
        <Loading />
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="shell shell--center">
        <ErrorBox message={error ?? "Não deu para carregar."} onRetry={reload} />
      </main>
    );
  }
  return <Routed me={data} path={path} />;
}

/**
 * Para onde o hash deve ir (null = ficar). Um evento só: entra direto nele. Vários: lista em
 * #/eventos. Hashes antigos (#/convites/12, sem /e/:id) vão para o mesmo lugar dentro do
 * evento atual (o único, ou o último aberto neste navegador).
 */
function resolveRedirect(
  path: string,
  events: { id: number }[],
  remembered: number | null,
): string | null {
  if (events.length === 0) return path === "/eventos" || path === "/conta" ? null : "/eventos";
  const only = events.length === 1 ? events[0] : undefined;
  const parsed = parseEventPath(path);
  if (parsed) {
    if (events.some((e) => e.id === parsed.eventId)) return null;
    return only ? `/e/${only.id}` : "/eventos";
  }
  if (path === "/eventos") return only ? `/e/${only.id}` : null;
  const current = only ?? events.find((e) => e.id === remembered);
  if (!current) return path === "/conta" ? null : "/eventos";
  return `/e/${current.id}${path === "/" ? "" : path}`;
}

function Routed({ me, path }: { me: MeResponse; path: string }) {
  const redirectTo = resolveRedirect(path, me.events, lastEvent());
  useEffect(() => {
    if (redirectTo) window.location.replace(`#${redirectTo}`);
  }, [redirectTo]);
  if (redirectTo) return null;

  const parsed = parseEventPath(path);
  const event = parsed ? me.events.find((e) => e.id === parsed.eventId) : undefined;
  if (parsed && event) {
    return (
      <Frame me={me} event={event} rest={parsed.rest}>
        <Page path={parsed.rest} />
      </Frame>
    );
  }
  return (
    <Frame me={me} event={null} rest="">
      {path === "/conta" ? (
        <Conta />
      ) : me.events.length === 0 ? (
        <div className="stack">
          <h1>Nenhum evento por aqui</h1>
          <p className="muted">
            Sua conta ainda não está ligada a nenhum evento. Peça a quem organiza o evento para
            incluir você.
          </p>
        </div>
      ) : (
        <EventsPage events={me.events} />
      )}
    </Frame>
  );
}

function Brand({ event }: { event: MeEvent | null }) {
  return (
    <a
      className="brand"
      href={event ? eh("/") : "#/eventos"}
      aria-label={event ? `Painel de ${event.name}, início` : "Painel, seus eventos"}
    >
      <span className="brand__mark" aria-hidden="true">
        {event ? monogramOf(event.name) : "&"}
      </span>
      <span className="brand__label">{event ? event.name : "Painel"}</span>
    </a>
  );
}

function Frame({
  me,
  event,
  rest,
  children,
}: {
  me: MeResponse;
  event: MeEvent | null;
  /** Caminho da página dentro do evento ("/convites/12"). */
  rest: string;
  children: ReactNode;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const section = `/${rest.split("?")[0]!.split("/")[1] ?? ""}`;
  // Antes de renderizar a página: as rotas e links dela usam o evento atual.
  if (event) setCurrentEventId(event.id);
  useEffect(() => {
    if (event) rememberEvent(event.id);
    document.title = event ? `Painel · ${event.name}` : "Painel";
  }, [event]);
  // No celular o menu rola de lado: mantém a seção atual à vista.
  useEffect(() => {
    document
      .querySelector('.nav a[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [section]);

  return (
    <div className="app">
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <Brand event={event} />
        <div className="topbar__user">
          {me.events.length > 1 && (
            <label className="topbar__event">
              <span className="sr-only">Evento</span>
              <select
                value={event?.id ?? ""}
                onChange={(e) => goAbsolute(e.target.value ? `/e/${e.target.value}` : "/eventos")}
              >
                {!event && <option value="">Seus eventos</option>}
                {me.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a href={event ? eh("/conta") : "#/conta"} className="topbar__name" title={me.user.email}>
            {me.user.name}
          </a>
          <button
            className="button button--ghost button--small"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await authClient.signOut();
              setSigningOut(false);
              goAbsolute("/");
            }}
          >
            Sair
          </button>
        </div>
      </header>
      {event && (
        <nav className="nav" aria-label="Seções do painel">
          <ul>
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={eh(item.href)} aria-current={section === item.href ? "page" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <main className="content" id="conteudo" tabIndex={-1}>
        {event ? (
          // key: ao trocar de evento a página remonta e recarrega os próprios dados.
          <EventProvider key={event.id} value={event}>
            {children}
          </EventProvider>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) setError(describeError(error));
  }

  return (
    <main className="shell shell--center">
      <section className="card card--narrow">
        <div className="login-brand" aria-hidden="true">
          <span className="brand__mark">&amp;</span>
        </div>
        <form onSubmit={onSubmit} className="stack">
          <h1>Entrar no painel</h1>
          <p className="muted">Acesso só para quem organiza o evento.</p>
          <label className="field">
            <span className="field__label">E-mail</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}
          <button className="button button--block" type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
