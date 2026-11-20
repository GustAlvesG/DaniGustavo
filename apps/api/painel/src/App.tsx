import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { apiRoot, SESSION_EXPIRED } from "./api.ts";
import { authClient, describeError } from "./auth-client.ts";
import {
  AccessProvider,
  canDo,
  EventProvider,
  EventsPage,
  monogramOf,
  useCan,
  useEventAccess,
  type MeEvent,
  type MeOrganization,
  type MeResponse,
} from "./event.tsx";
import {
  eh,
  goAbsolute,
  lastEvent,
  oh,
  rememberEvent,
  setCurrentEventId,
  setCurrentOrgId,
} from "./nav.ts";
import { ORG_NAV, OrgPage, OrgProvider } from "./org.tsx";
import {
  parseEventPath,
  parseOrgPath,
  pickerTarget,
  pickerValue,
  resolveRedirect,
} from "./routes.ts";
import type { EventAction } from "@casamento/shared";
import { Aceitar } from "./pages/Aceitar.tsx";
import { Aparencia } from "./pages/Aparencia.tsx";
import { Configuracoes } from "./pages/Configuracoes.tsx";
import { Conta } from "./pages/Conta.tsx";
import { ConviteDetalhe, ConviteForm, Convites } from "./pages/Convites.tsx";
import { ConvitesQr } from "./pages/ConvitesQr.tsx";
import { Importar } from "./pages/Importar.tsx";
import { Listas } from "./pages/Listas.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Evento } from "./pages/Evento.tsx";
import { Galeria } from "./pages/Galeria.tsx";
import { Lembretes } from "./pages/Lembretes.tsx";
import { Pedidos } from "./pages/Pedidos.tsx";
import { Presentes } from "./pages/Presentes.tsx";
import { Recados } from "./pages/Recados.tsx";
import { Site } from "./pages/Site.tsx";
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

/** Menu do evento; `action` é a permissão que libera o item (sem ela, some do menu). */
const NAV: { href: string; label: string; action?: EventAction }[] = [
  { href: "/", label: "Início" },
  { href: "/convites", label: "Convites", action: "invitations.read" },
  { href: "/presentes", label: "Presentes", action: "gifts.write" },
  { href: "/pedidos", label: "Pedidos", action: "orders.read" },
  { href: "/recados", label: "Recados", action: "messages.moderate" },
  { href: "/lembretes", label: "Lembretes", action: "reminders.write" },
  { href: "/site", label: "Site", action: "content.write" },
  { href: "/galeria", label: "Galeria", action: "content.write" },
  { href: "/aparencia", label: "Aparência", action: "content.write" },
  { href: "/evento", label: "Evento", action: "event.configure" },
  { href: "/configuracoes", label: "Configurações", action: "settings.write" },
];

const SECTION_ACTION = new Map(NAV.map((i) => [i.href.slice(1), i.action]));

/** Página do evento; `path` é relativo a ele ("/convites/12"). */
function Page({ path }: { path: string }) {
  const section = path.split("?")[0]!.split("/").filter(Boolean)[0] ?? "";
  const action = SECTION_ACTION.get(section);
  const allowed = useCan(action ?? "dashboard.read");
  if (action && !allowed) {
    return (
      <div className="stack">
        <h1>Sem permissão</h1>
        <p className="muted">Você não tem acesso a esta parte do evento. Fale com quem organiza.</p>
        <a href={eh("/")}>Voltar ao início</a>
      </div>
    );
  }
  return <PageRoutes path={path} />;
}

function PageRoutes({ path }: { path: string }) {
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
    case "site":
      return <Site />;
    case "galeria":
      return <Galeria />;
    case "aparencia":
      return <Aparencia />;
    case "evento":
      return <Evento />;
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
  const path = useHashPath();
  // Fase 3: aceite de convite abre com ou sem sessão (quem ainda não tem conta cria aqui).
  const invite = /^\/aceitar\/([^/?]+)/.exec(path);
  if (invite) {
    return (
      <ToastProvider>
        <Aceitar token={decodeURIComponent(invite[1]!)} />
      </ToastProvider>
    );
  }
  return <Session />;
}

function Session() {
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

function Routed({ me, path }: { me: MeResponse; path: string }) {
  const redirectTo = resolveRedirect(path, me.events, lastEvent(), me.organizations);
  useEffect(() => {
    if (redirectTo) window.location.replace(`#${redirectTo}`);
  }, [redirectTo]);
  if (redirectTo) return null;

  const orgParsed = parseOrgPath(path);
  const org = orgParsed ? me.organizations.find((o) => o.id === orgParsed.orgId) : undefined;
  if (orgParsed && org) {
    return (
      <Frame me={me} event={null} org={org} rest={orgParsed.rest}>
        <OrgPage path={orgParsed.rest} />
      </Frame>
    );
  }

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
      ) : me.events.length === 0 && me.organizations.length === 0 ? (
        <div className="stack">
          <h1>Nenhum evento por aqui</h1>
          <p className="muted">
            Sua conta ainda não está ligada a nenhum evento. Peça a quem organiza o evento para
            incluir você.
          </p>
        </div>
      ) : (
        <EventsPage events={me.events} organizations={me.organizations} />
      )}
    </Frame>
  );
}

function Brand({ event, org }: { event: MeEvent | null; org: MeOrganization | null }) {
  const label = event ? event.name : org ? org.name : "Painel";
  return (
    <a
      className="brand"
      href={event ? eh("/") : org ? oh("/") : "#/eventos"}
      aria-label={
        event
          ? `Painel de ${event.name}, início`
          : org
            ? `Organização ${org.name}, início`
            : "Painel, seus eventos"
      }
    >
      <span className="brand__mark" aria-hidden="true">
        {event || org ? monogramOf(label) : "&"}
      </span>
      <span className="brand__label">{label}</span>
    </a>
  );
}

/** Seletor do topo: organizações e seus eventos, agrupados; trocar leva a #/o/:id ou #/e/:id. */
function Picker({
  me,
  event,
  org,
}: {
  me: MeResponse;
  event: MeEvent | null;
  org: MeOrganization | null;
}) {
  if (me.organizations.length + me.events.length <= 1) return null;
  const groups = new Map<number, { name: string; org: MeOrganization | null; events: MeEvent[] }>();
  for (const o of me.organizations) groups.set(o.id, { name: o.name, org: o, events: [] });
  for (const ev of me.events) {
    const g = groups.get(ev.orgId) ?? { name: ev.orgName, org: null, events: [] };
    g.events.push(ev);
    groups.set(ev.orgId, g);
  }
  const value = event ? pickerValue("e", event.id) : org ? pickerValue("o", org.id) : "all";
  return (
    <label className="topbar__event">
      <span className="sr-only">Organização e evento</span>
      <select
        value={value}
        onChange={(e) =>
          goAbsolute(e.target.value === "all" ? "/eventos" : pickerTarget(e.target.value))
        }
      >
        <option value="all">Todas as organizações e eventos</option>
        {[...groups.entries()].map(([id, g]) => (
          <optgroup key={id} label={g.name}>
            {g.org && <option value={pickerValue("o", id)}>Organização: {g.name}</option>}
            {g.events.map((ev) => (
              <option key={ev.id} value={pickerValue("e", ev.id)}>
                {ev.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function Frame({
  me,
  event,
  org = null,
  rest,
  children,
}: {
  me: MeResponse;
  event: MeEvent | null;
  /** Fase 3: organização aberta (#/o/:orgId); exclusiva com `event`. */
  org?: MeOrganization | null;
  /** Caminho da página dentro do evento ("/convites/12"). */
  rest: string;
  children: ReactNode;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const access = useEventAccess(event?.id ?? null);
  const section = `/${rest.split("?")[0]!.split("/")[1] ?? ""}`;
  // Antes de renderizar a página: as rotas e links dela usam o evento atual.
  if (event) setCurrentEventId(event.id);
  if (org) setCurrentOrgId(org.id);
  useEffect(() => {
    if (event) rememberEvent(event.id);
    document.title = event ? `Painel · ${event.name}` : org ? `Painel · ${org.name}` : "Painel";
  }, [event, org]);
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
        <Brand event={event} org={org} />
        <div className="topbar__user">
          <Picker me={me} event={event} org={org} />
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
      {org && (
        <nav className="nav" aria-label="Seções da organização">
          <ul>
            {ORG_NAV.map((item) => (
              <li key={item.href}>
                <a href={oh(item.href)} aria-current={section === item.href ? "page" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {event && (
        <nav className="nav" aria-label="Seções do painel">
          <ul>
            {NAV.filter((item) => !item.action || canDo(access, item.action)).map((item) => (
              <li key={item.href}>
                <a href={eh(item.href)} aria-current={section === item.href ? "page" : undefined}>
                  {item.label}
                </a>
              </li>
            ))}
            {/* Equipe da organização (dono, membro, administração): anfitriões e permissões. */}
            {(access?.role ?? event.role) !== "event_host" && (
              <>
                <li className="nav__sep" aria-hidden="true" />
                <li>
                  <a href={`#/o/${event.orgId}/eventos/${event.id}/anfitrioes`}>Anfitriões</a>
                </li>
                <li>
                  <a href={`#/o/${event.orgId}/eventos/${event.id}/permissoes`}>
                    Permissões do anfitrião
                  </a>
                </li>
              </>
            )}
          </ul>
        </nav>
      )}
      <main className="content" id="conteudo" tabIndex={-1}>
        {event ? (
          // key: ao trocar de evento a página remonta e recarrega os próprios dados.
          <EventProvider key={event.id} value={event}>
            <AccessProvider value={access}>{children}</AccessProvider>
          </EventProvider>
        ) : org ? (
          <OrgProvider key={org.id} value={org}>
            {children}
          </OrgProvider>
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
