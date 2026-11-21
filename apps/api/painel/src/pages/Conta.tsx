import { useState, type FormEvent } from "react";
import { apiRoot, errorMessage } from "../api.ts";
import { authClient, describeError } from "../auth-client.ts";
import { Confirm, Field, FormError, PageHeader, useToast } from "../ui.tsx";

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
      <MeusDados email={data?.user.email ?? ""} />
    </div>
  );
}

/**
 * LGPD (Fase 6): baixar os dados da própria conta e apagar a conta. A API recusa (409) se a
 * pessoa for a única dona de uma organização com eventos, equipe ou assinatura, ou titular de
 * conta de recebimento; a mensagem diz o que fazer antes.
 */
function MeusDados({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase() && email !== "";

  async function remove() {
    if (!matches) return setError("Digite exatamente o e-mail da sua conta.");
    setBusy(true);
    setError(null);
    try {
      await apiRoot<{ ok: true }>("/me", {
        method: "DELETE",
        body: JSON.stringify({ confirmEmail: typed.trim() }),
      });
      await authClient.signOut().catch(() => undefined);
      window.location.replace("/painel/");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section className="card stack narrow" aria-labelledby="conta-dados">
      <div>
        <h2 id="conta-dados">Meus dados</h2>
        <p className="muted small">
          Baixe o que a plataforma guarda sobre você (conta, organizações, eventos e aceites dos
          termos). Os dados dos convidados ficam na página Privacidade de cada evento.
        </p>
      </div>
      <div>
        <a className="button button--ghost" href="/api/admin/me/export" download>
          Baixar meus dados (JSON)
        </a>
      </div>
      <div>
        <h3>Apagar minha conta</h3>
        <p className="muted small">
          Apaga o seu login, as sessões e os vínculos com organizações e eventos. O que você fez nos
          eventos fica, sem o seu nome. Não dá para desfazer.
        </p>
        <button className="button button--danger" type="button" onClick={() => setOpen(true)}>
          Apagar minha conta…
        </button>
      </div>
      <Confirm
        open={open}
        title="Apagar minha conta"
        confirmLabel="Apagar para sempre"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => {
          setOpen(false);
          setTyped("");
          setError(null);
        }}
      >
        <Field label={`Digite o seu e-mail (${email}) para confirmar`}>
          <input
            type="email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <FormError message={error} />
      </Confirm>
    </section>
  );
}
