import {
  ORG_MEMBER_ROLE_LABELS,
  PASSWORD_MIN,
  type AcceptTeamInviteResult,
  type TeamInvitePreview,
} from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage, teamInviteApi } from "../api.ts";
import { authClient, describeError } from "../auth-client.ts";
import { formatDateTime } from "../format.ts";
import { goAbsolute } from "../nav.ts";
import { ErrorBox, Field, FormError, Loading, useLoad } from "../ui.tsx";

/*
 * Fase 3, frente B (docs/saas/fase-3.md): aceite de convite da equipe/anfitrião em
 * #/aceitar/<token>. Abre com ou sem sessão (o App renderiza antes do login). Sem conta:
 * nome + senha criam a conta e o painel entra com ela. Com conta: pede login com o e-mail do
 * convite e só vincula.
 */
export function Aceitar({ token }: { token: string }) {
  const session = authClient.useSession();
  const sessionEmail = session.data?.user.email ?? null;
  const { data, error, loading, reload } = useLoad(
    () => teamInviteApi<TeamInvitePreview>(`/${encodeURIComponent(token)}`),
    [token, sessionEmail],
  );

  return (
    <main className="shell shell--center">
      <section className="card card--narrow stack">
        <div className="login-brand" aria-hidden="true">
          <span className="brand__mark">&amp;</span>
        </div>
        <h1>Convite para o painel</h1>
        {loading && !data ? <Loading /> : null}
        {error ? (
          <>
            <ErrorBox message={error} />
            <a href="#/">Ir para o painel</a>
          </>
        ) : data && !session.isPending ? (
          <InviteBody
            token={token}
            preview={data}
            sessionEmail={sessionEmail}
            onSessionChange={() => {
              void session.refetch();
              reload();
            }}
          />
        ) : null}
      </section>
    </main>
  );
}

function describeInvite(p: TeamInvitePreview): string {
  if (p.role === "host") return `ser anfitrião de ${p.eventName ?? "um evento"}`;
  return `fazer parte da equipe de ${p.organizationName} como ${ORG_MEMBER_ROLE_LABELS[
    p.role
  ].toLowerCase()}`;
}

/** Depois do aceite, abre o que o convite liberou. */
function openResult(r: AcceptTeamInviteResult) {
  goAbsolute(r.eventId ? `/e/${r.eventId}` : `/o/${r.organizationId}`);
}

function InviteBody({
  token,
  preview,
  sessionEmail,
  onSessionChange,
}: {
  token: string;
  preview: TeamInvitePreview;
  sessionEmail: string | null;
  onSessionChange: () => void;
}) {
  const sameAccount = sessionEmail !== null && sessionEmail.toLowerCase() === preview.email;
  return (
    <>
      <p>
        Você foi convidado para <strong>{describeInvite(preview)}</strong>
        {preview.role === "host" ? ` (${preview.organizationName})` : ""}.
      </p>
      <p className="muted small">
        Convite para {preview.email}, válido até {formatDateTime(preview.expiresAt)}.
      </p>
      {!preview.accountExists ? (
        <CreateAccount token={token} />
      ) : sameAccount ? (
        <AcceptExisting token={token} />
      ) : sessionEmail ? (
        <WrongAccount sessionEmail={sessionEmail} onSignedOut={onSessionChange} />
      ) : (
        <SignInFirst onSignedIn={onSessionChange} />
      )}
    </>
  );
}

function CreateAccount({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) {
      return setFormError(`A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`);
    }
    if (password !== confirm) return setFormError("As duas senhas não são iguais.");
    setBusy(true);
    setFormError(null);
    try {
      const result = await teamInviteApi<AcceptTeamInviteResult>(
        `/${encodeURIComponent(token)}/accept`,
        { method: "POST", body: JSON.stringify({ name, password }) },
      );
      const { error } = await authClient.signIn.email({ email: result.email, password });
      if (error) {
        setFormError(`Conta criada, mas não deu para entrar agora: ${describeError(error)}`);
        return;
      }
      openResult(result);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p className="muted small">Crie sua senha para entrar no painel.</p>
      <Field label="Seu nome">
        <input
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Senha" hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Repita a senha">
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <FormError message={formError} />
      <button className="button button--block" type="submit" disabled={busy || !name.trim()}>
        {busy ? "Criando a conta…" : "Criar conta e aceitar"}
      </button>
    </form>
  );
}

function AcceptExisting({ token }: { token: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    setFormError(null);
    try {
      openResult(
        await teamInviteApi<AcceptTeamInviteResult>(`/${encodeURIComponent(token)}/accept`, {
          method: "POST",
          body: "{}",
        }),
      );
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <FormError message={formError} />
      <button className="button button--block" onClick={() => void accept()} disabled={busy}>
        {busy ? "Aceitando…" : "Aceitar convite"}
      </button>
    </div>
  );
}

function WrongAccount({
  sessionEmail,
  onSignedOut,
}: {
  sessionEmail: string;
  onSignedOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <p className="alert alert--error" role="alert">
        Você está no painel como {sessionEmail}, mas este convite é para outro e-mail. Saia e entre
        com o e-mail que recebeu o convite.
      </p>
      <button
        className="button button--block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await authClient.signOut();
          setBusy(false);
          onSignedOut();
        }}
      >
        Sair desta conta
      </button>
    </div>
  );
}

function SignInFirst({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) return setFormError(describeError(error));
    onSignedIn();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted small">
        Já existe uma conta com o e-mail do convite. Entre com ela para aceitar.
      </p>
      <Field label="E-mail">
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Senha">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <FormError message={formError} />
      <button className="button button--block" type="submit" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
