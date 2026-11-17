import { useState, type FormEvent } from "react";
import { authClient, describeError } from "../auth-client.ts";
import { Field, FormError, PageHeader, useToast } from "../ui.tsx";

export function Conta() {
  const toast = useToast();
  const { data } = authClient.useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [others, setOthers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 10) return setError("A nova senha precisa ter pelo menos 10 caracteres.");
    if (next !== repeat) return setError("A confirmação não é igual à nova senha.");
    if (next === current) return setError("A nova senha precisa ser diferente da atual.");
    setBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: others,
    });
    setBusy(false);
    if (error) return setError(describeError(error));
    setCurrent("");
    setNext("");
    setRepeat("");
    toast("Senha trocada.");
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Minha conta"
        subtitle={data ? `${data.user.name} · ${data.user.email}` : undefined}
      />
      <form className="card stack narrow" onSubmit={onSubmit} noValidate>
        <h2>Trocar senha</h2>
        <Field label="Senha atual">
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>
        <Field label="Nova senha" hint="Pelo menos 10 caracteres. Uma frase curta é ótima.">
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={10}
            required
          />
        </Field>
        <Field label="Repita a nova senha">
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
        </Field>
        <label className="check">
          <input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} />
          Sair dos outros aparelhos
        </label>
        <FormError message={error} />
        <div>
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Trocar senha"}
          </button>
        </div>
      </form>
    </div>
  );
}
