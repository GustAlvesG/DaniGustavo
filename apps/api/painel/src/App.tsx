import { useState, type FormEvent } from "react";
import { authClient } from "./auth-client.ts";

type AuthError = { code?: string; status?: number; message?: string } | null | undefined;

/** Traduz erros do Better Auth: diz o que houve e como resolver. */
function describeError(error: AuthError): string {
  if (!error) return "Algo deu errado. Tente de novo.";
  if (error.status === 429) return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou senha incorretos. Confira os dados e tente de novo.";
  }
  if (error.status === undefined || error.status === 0)
    return "Sem conexão com a API. Verifique se o servidor está rodando e tente de novo.";
  return `Não foi possível concluir (${error.message ?? "erro desconhecido"}). Tente de novo.`;
}

export function App() {
  const { data, isPending } = authClient.useSession();
  // O Better Auth refaz a busca da sessão após o login; o "Carregando…" só na primeira carga.
  const [loaded, setLoaded] = useState(false);
  if (!isPending && !loaded) setLoaded(true);

  if (!loaded) {
    return (
      <main className="shell shell--center">
        <p className="muted">Carregando…</p>
      </main>
    );
  }

  return data ? <Dashboard user={data.user} /> : <Login />;
}

function Brand() {
  return (
    <div className="brand" aria-label="Dani e Gustavo">
      <span className="brand__mark">D&nbsp;&amp;&nbsp;G</span>
      <span className="brand__label">Painel</span>
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
        <Brand />
        <form onSubmit={onSubmit} className="form">
          <h1>Entrar no painel</h1>
          <p className="muted">Acesso só para os noivos.</p>
          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}

interface PanelUser {
  name: string;
  email: string;
}

function Dashboard({ user }: { user: PanelUser }) {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
        <div className="topbar__user">
          <span className="topbar__email">{user.email}</span>
          <button
            className="button button--ghost button--small"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await authClient.signOut();
              setSigningOut(false);
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <main className="content">
        <h1>Olá, {user.name}</h1>
        <p className="muted">
          O painel completo (convidados, presentes, pedidos e recados) chega nas próximas fases.
        </p>
      </main>
    </div>
  );
}
