import { useEffect, useState, type FormEvent } from "react";
import { SESSION_EXPIRED } from "./api.ts";
import { authClient, describeError } from "./auth-client.ts";
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
import { ToastProvider } from "./ui.tsx";

/* ------------------------------------------------------------------------ */
/* Rotas por hash (#/convites/12): sem roteador, o servidor só entrega index */
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

function Page({ path }: { path: string }) {
  // "#/convites/qr?ids=1,2": a parte depois do "?" vai para a página.
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
          <a href="#/">Voltar ao início</a>
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
      <Shell user={data.user} />
    </ToastProvider>
  ) : (
    <Login />
  );
}

function Brand() {
  return (
    <a className="brand" href="#/" aria-label="Painel Dani e Gustavo, início">
      <span className="brand__mark" aria-hidden="true">
        D&nbsp;&amp;&nbsp;G
      </span>
      <span className="brand__label">Painel</span>
    </a>
  );
}

function Shell({ user }: { user: { name: string; email: string } }) {
  const path = useHashPath();
  const section = `/${path.split("/")[1] ?? ""}`;
  const [signingOut, setSigningOut] = useState(false);
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
        <Brand />
        <div className="topbar__user">
          <a href="#/conta" className="topbar__name" title={user.email}>
            {user.name}
          </a>
          <button
            className="button button--ghost button--small"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await authClient.signOut();
              setSigningOut(false);
              window.location.hash = "/";
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <nav className="nav" aria-label="Seções do painel">
        <ul>
          {NAV.map((item) => (
            <li key={item.href}>
              <a href={`#${item.href}`} aria-current={section === item.href ? "page" : undefined}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content" id="conteudo" tabIndex={-1}>
        <Page path={path} />
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
          <span className="brand__mark">D&nbsp;&amp;&nbsp;G</span>
        </div>
        <form onSubmit={onSubmit} className="stack">
          <h1>Entrar no painel</h1>
          <p className="muted">Acesso só para os noivos.</p>
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
