import type { EventHostRow, TeamInvite } from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { formatDate } from "../../format.ts";
import { oh } from "../../nav.ts";
import {
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";
import { InviteRows } from "./Convites.tsx";

/* Fase 3, frente B: anfitriões de um evento da organização (convidar por e-mail e remover). */

interface HostsView {
  hosts: EventHostRow[];
  invites: TeamInvite[];
}

export function Anfitrioes({ eventId }: { eventId: number }) {
  const toast = useToast();
  const base = `/events/${eventId}/hosts`;
  const { data, setData, error, loading, reload } = useLoad(
    () => orgApi<HostsView>(base),
    [eventId],
  );
  const [removing, setRemoving] = useState<EventHostRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      setData(await orgSend<HostsView>("DELETE", `${base}/${removing.userId}`));
      toast(`${removing.name} não é mais anfitrião deste evento.`);
      setRemoving(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Anfitriões"
        subtitle="Quem administra este evento pelo painel. O anfitrião só vê este evento, não a organização."
        actions={
          <a className="button button--ghost" href={oh("/eventos")}>
            Voltar aos eventos
          </a>
        }
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          {data.hosts.length === 0 ? (
            <p className="empty">Este evento ainda não tem anfitriões.</p>
          ) : (
            <ul className="rows">
              {data.hosts.map((h) => (
                <li key={h.userId} className="row" data-testid="anfitriao">
                  <div className="row__main">
                    <span className="row__title">{h.name}</span>
                    <span className="row__meta">
                      {h.email} · desde {formatDate(h.since)}
                    </span>
                  </div>
                  <div className="row__side">
                    <button
                      className="button button--ghost button--small"
                      onClick={() => setRemoving(h)}
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <HostInviteForm base={base} onSent={reload} />
          <section className="stack" aria-labelledby="anfitrioes-convites">
            <h2 id="anfitrioes-convites">Convites aguardando resposta</h2>
            <InviteRows invites={data.invites} onChange={reload} />
          </section>
        </>
      ) : null}
      <Confirm
        open={removing !== null}
        title="Remover anfitrião"
        confirmLabel="Remover"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      >
        <p>
          <strong>{removing?.name}</strong> perde o acesso a este evento na hora. A conta continua
          existindo.
        </p>
      </Confirm>
    </div>
  );
}

function HostInviteForm({ base, onSent }: { base: string; onSent: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const { invite } = await orgSend<{ invite: TeamInvite }>("POST", base, { email });
      toast(`Convite enviado para ${invite.email}.`);
      setEmail("");
      onSent();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="convidar-anfitriao">
      <div>
        <h2 id="convidar-anfitriao">Convidar anfitrião</h2>
        <p className="muted small">
          A pessoa recebe um e-mail com um link que vale 7 dias. Quem já tem conta entra com ela;
          quem não tem cria a senha ao aceitar.
        </p>
      </div>
      <Field label="E-mail">
        <input
          type="email"
          autoComplete="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <FormError message={formError} />
      <div>
        <button className="button" type="submit" disabled={saving || !email.trim()}>
          {saving ? "Enviando…" : "Enviar convite"}
        </button>
      </div>
    </form>
  );
}
