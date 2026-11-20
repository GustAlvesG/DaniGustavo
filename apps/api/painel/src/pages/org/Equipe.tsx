import {
  ORG_MEMBER_ROLE_LABELS,
  ORG_MEMBER_ROLES,
  type OrgMember,
  type OrgMemberRole,
  type TeamInvite,
} from "@casamento/shared";
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
import { useCanManageTeam } from "./Convites.tsx";

/* Fase 3, frente B: equipe da organização (dono muda papel, remove e convida). */

export function Equipe() {
  const toast = useToast();
  const canManage = useCanManageTeam();
  const { data, setData, error, loading, reload } = useLoad(
    () => orgApi<{ members: OrgMember[] }>("/members"),
    [],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<OrgMember | null>(null);

  async function changeRole(member: OrgMember, role: OrgMemberRole) {
    setBusy(member.userId);
    try {
      setData(
        await orgSend<{ members: OrgMember[] }>("PATCH", `/members/${member.userId}`, { role }),
      );
      toast(`${member.name} agora é ${ORG_MEMBER_ROLE_LABELS[role].toLowerCase()}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(removing.userId);
    try {
      setData(await orgSend<{ members: OrgMember[] }>("DELETE", `/members/${removing.userId}`));
      toast(`${removing.name} saiu da equipe.`);
      setRemoving(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Equipe"
        subtitle="Quem ajuda a organizar os eventos e o papel de cada um. Donos cuidam da equipe; membros criam eventos e convidam anfitriões."
        actions={
          <a className="button button--ghost" href={oh("/convites")}>
            Convites pendentes
          </a>
        }
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <ul className="rows">
          {data.members.map((m) => (
            <li key={m.userId} className="row" data-testid="membro-equipe">
              <div className="row__main">
                <span className="row__title">{m.name}</span>
                <span className="row__meta">
                  {m.email} · desde {formatDate(m.since)}
                </span>
              </div>
              <div className="row__side">
                {canManage ? (
                  <>
                    <label>
                      <span className="sr-only">Papel de {m.name}</span>
                      <select
                        value={m.role}
                        disabled={busy === m.userId}
                        onChange={(e) => void changeRole(m, e.target.value as OrgMemberRole)}
                      >
                        {ORG_MEMBER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ORG_MEMBER_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button button--ghost button--small"
                      disabled={busy === m.userId}
                      onClick={() => setRemoving(m)}
                    >
                      Remover
                    </button>
                  </>
                ) : (
                  <span className="muted small">{ORG_MEMBER_ROLE_LABELS[m.role]}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {canManage ? <InviteForm /> : null}
      <Confirm
        open={removing !== null}
        title="Remover da equipe"
        confirmLabel="Remover"
        danger
        busy={busy !== null}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      >
        <p>
          <strong>{removing?.name}</strong> perde o acesso à organização na hora. A conta continua
          existindo e pode ser convidada de novo.
        </p>
      </Confirm>
    </div>
  );
}

function InviteForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgMemberRole>("member");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const { invite } = await orgSend<{ invite: TeamInvite }>("POST", "/invites", { email, role });
      toast(`Convite enviado para ${invite.email}.`);
      setEmail("");
      setRole("member");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="convidar-equipe">
      <div>
        <h2 id="convidar-equipe">Convidar para a equipe</h2>
        <p className="muted small">
          A pessoa recebe um e-mail com um link que vale 7 dias. Quem ainda não tem conta cria a
          senha ao aceitar.
        </p>
      </div>
      <div className="inline-fields">
        <Field label="E-mail">
          <input
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Papel">
          <select value={role} onChange={(e) => setRole(e.target.value as OrgMemberRole)}>
            {ORG_MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ORG_MEMBER_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <FormError message={formError} />
      <div>
        <button className="button" type="submit" disabled={saving || !email.trim()}>
          {saving ? "Enviando…" : "Enviar convite"}
        </button>
      </div>
    </form>
  );
}
