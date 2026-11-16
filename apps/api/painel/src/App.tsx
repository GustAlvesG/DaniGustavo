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
    case "INVALID_PASSWORD":
      return "Senha incorreta. Digite a mesma senha que você usa para entrar.";
    case "INVALID_CODE":
    case "OTP_HAS_EXPIRED":
      return "Código inválido ou expirado. Digite o código que aparece agora no app autenticador.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Muitas tentativas com código errado. Aguarde alguns minutos e entre de novo.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "A etapa de verificação expirou. Entre com e-mail e senha de novo.";
    case "TOTP_ALREADY_ENABLED":
      return "A verificação em duas etapas já está ativa nesta conta.";
  }
  if (error.status === undefined || error.status === 0)
    return "Sem conexão com a API. Verifique se o servidor está rodando e tente de novo.";
  return `Não foi possível concluir (${error.message ?? "erro desconhecido"}). Tente de novo.`;
}

export function App() {
  const { data, isPending } = authClient.useSession();
  // O Better Auth refaz a busca da sessão após o login; mostrar "Carregando…" de novo
  // desmontaria o formulário e perderia a etapa do código. Só na primeira carga.
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
  const [step, setStep] = useState<"password" | "totp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) return setError(describeError(error));
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) setStep("totp");
  }

  async function onTotp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) {
      if (error.code === "INVALID_TWO_FACTOR_COOKIE") setStep("password");
      return setError(describeError(error));
    }
  }

  return (
    <main className="shell shell--center">
      <section className="card card--narrow">
        <Brand />
        {step === "password" ? (
          <form onSubmit={onPassword} className="form">
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
        ) : (
          <form onSubmit={onTotp} className="form">
            <h1>Verificação em duas etapas</h1>
            <p className="muted">Digite o código de 6 dígitos do seu app autenticador.</p>
            <label className="field">
              <span>Código</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Verificando…" : "Verificar"}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => {
                setStep("password");
                setCode("");
                setError(null);
              }}
            >
              Voltar
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

interface PanelUser {
  name: string;
  email: string;
  twoFactorEnabled?: boolean | null;
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
        <TwoFactorSection enabled={Boolean(user.twoFactorEnabled)} />
      </main>
    </div>
  );
}

/** Extrai o segredo do otpauth:// para digitação manual. */
function secretFromUri(uri: string): string {
  try {
    const secret = new URL(uri).searchParams.get("secret") ?? "";
    return secret.replace(/(.{4})/g, "$1 ").trim();
  } catch {
    return "";
  }
}

function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (enabled || done) {
    return (
      <section className="card">
        <h2>Verificação em duas etapas</h2>
        <p className="success">Verificação em duas etapas ativa.</p>
        {setup && (
          <>
            <p className="muted">
              Guarde estes códigos de recuperação num lugar seguro. Cada um funciona uma vez, se
              você perder o celular.
            </p>
            <ul className="codes">
              {setup.backupCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    );
  }

  async function onEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
    setBusy(false);
    if (error || !data || data.method !== "totp") return setError(describeError(error));
    setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes });
    setPassword("");
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) return setError(describeError(error));
    setDone(true);
  }

  return (
    <section className="card">
      <h2>Verificação em duas etapas</h2>
      {!setup ? (
        <form onSubmit={onEnable} className="form">
          <p className="muted">
            Proteja o acesso com um código do app autenticador (Google Authenticator, 1Password,
            Authy…). Confirme sua senha para começar.
          </p>
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
            {busy ? "Preparando…" : "Ativar verificação"}
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="form">
          <ol className="steps">
            <li>
              No celular, toque no link abaixo ou adicione a conta manualmente no app autenticador
              com a chave.
            </li>
            <li>Digite o código de 6 dígitos que o app mostrar.</li>
          </ol>
          <a className="uri" href={setup.totpURI}>
            Abrir no app autenticador
          </a>
          <p className="secret">
            <span className="muted">Chave:</span> <code>{secretFromUri(setup.totpURI)}</code>
          </p>
          <label className="field">
            <span>Código</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Verificando…" : "Confirmar código"}
          </button>
        </form>
      )}
    </section>
  );
}
