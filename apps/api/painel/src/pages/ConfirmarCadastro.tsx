import { PASSWORD_MIN, type SignupConfirmResult, type SignupPreview } from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { ApiFailure, errorMessage } from "../api.ts";
import { authClient, describeError } from "../auth-client.ts";
import { formatDateTime } from "../format.ts";
import { goAbsolute } from "../nav.ts";
import { ErrorBox, Field, FormError, Loading, LoginBrand, useLoad } from "../ui.tsx";

/*
 * Fase 6, frente B (docs/saas/fase-6.md): confirmação do cadastro self-service em
 * #/cadastro/<token> (o link do e-mail). Abre sem sessão (o App renderiza antes do login):
 * mostra o resumo do pedido, pede a senha, cria conta + organização + assinatura em teste e
 * entra no painel da organização nova.
 */

/** /api/signup/... (isento de X-Web-Key; a API confere a origem e limita por IP). */
async function signupApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/signup${path}`, {
      credentials: "same-origin",
      ...init,
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ApiFailure(0, "Sem conexão com o servidor. Confira a internet e tente de novo.");
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

export function ConfirmarCadastro({ token }: { token: string }) {
  const { data, error, loading } = useLoad(
    () => signupApi<SignupPreview>(`/${encodeURIComponent(token)}`),
    [token],
  );

  return (
    <main className="shell shell--center">
      <section className="card card--narrow stack">
        <LoginBrand />
        <h1>Confirmar cadastro</h1>
        {loading && !data ? <Loading /> : null}
        {error ? (
          <>
            <ErrorBox message={error} />
            <a href="#/">Ir para o painel</a>
          </>
        ) : null}
        {data ? <ConfirmForm token={token} preview={data} /> : null}
      </section>
    </main>
  );
}

function ConfirmForm({ token, preview }: { token: string; preview: SignupPreview }) {
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
      const result = await signupApi<SignupConfirmResult>(`/${encodeURIComponent(token)}/confirm`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      const { error } = await authClient.signIn.email({ email: result.email, password });
      if (error) {
        setFormError(`Conta criada, mas não deu para entrar agora: ${describeError(error)}`);
        return;
      }
      goAbsolute(`/o/${result.organizationId}`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p>
        Que bom ter você aqui, <strong>{preview.name}</strong>! Falta só escolher uma senha para
        criar o espaço de <strong>{preview.organizationName}</strong>.
      </p>
      <p className="muted small">
        Conta para {preview.email}, plano {preview.planName}. Link válido até{" "}
        {formatDateTime(preview.expiresAt)}.
      </p>
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
      <button className="button button--block" type="submit" disabled={busy || !password}>
        {busy ? "Criando a conta…" : "Criar conta e entrar"}
      </button>
    </form>
  );
}
