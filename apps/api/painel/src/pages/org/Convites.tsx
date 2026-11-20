import type { TeamInvite, TeamInviteStatus } from "@casamento/shared";
import { ORG_MEMBER_ROLE_LABELS } from "@casamento/shared";
import { useState } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { formatDateTime } from "../../format.ts";
import { oh } from "../../nav.ts";
import { useOrg } from "../../org.tsx";
import { Badge, Confirm, ErrorBox, Loading, PageHeader, useLoad, useToast } from "../../ui.tsx";

/* Fase 3, frente B: convites da equipe e de anfitriões ainda não aceitos. */

const STATUS_LABEL: Record<TeamInviteStatus, string> = {
  pending: "Aguardando",
  expired: "Vencido",
  accepted: "Aceito",
  revoked: "Cancelado",
};

export const inviteRoleLabel = (invite: TeamInvite) =>
  invite.role === "host"
    ? `Anfitrião${invite.eventName ? ` · ${invite.eventName}` : ""}`
    : `Equipe · ${ORG_MEMBER_ROLE_LABELS[invite.role]}`;

/** Dono (ou platform admin) mexe na equipe; membro só nos convites de anfitrião. */
export const useCanManageTeam = () => {
  const org = useOrg();
  return org.role === "org_owner" || org.role === "platform_admin";
};

/** Lista de convites com Reenviar e Cancelar; `onChange` recarrega a página dona. */
export function InviteRows({ invites, onChange }: { invites: TeamInvite[]; onChange: () => void }) {
  const toast = useToast();
  const canTeam = useCanManageTeam();
  const [busy, setBusy] = useState<number | null>(null);
  const [revoking, setRevoking] = useState<TeamInvite | null>(null);

  async function resend(invite: TeamInvite) {
    setBusy(invite.id);
    try {
      await orgSend("POST", `/invites/${invite.id}/resend`);
      toast(`Convite reenviado para ${invite.email}. O link anterior deixou de valer.`);
      onChange();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (!revoking) return;
    setBusy(revoking.id);
    try {
      await orgSend("DELETE", `/invites/${revoking.id}`);
      toast("Convite cancelado. O link não funciona mais.");
      setRevoking(null);
      onChange();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  if (invites.length === 0) return <p className="empty">Nenhum convite aguardando resposta.</p>;
  return (
    <>
      <ul className="rows">
        {invites.map((invite) => {
          const allowed = invite.role === "host" || canTeam;
          return (
            <li key={invite.id} className="row" data-testid="convite-equipe">
              <div className="row__main">
                <span className="row__title">{invite.email}</span>
                <span className="row__meta">
                  {inviteRoleLabel(invite)}
                  {invite.invitedBy ? ` · convidado por ${invite.invitedBy}` : ""}
                  {invite.status === "pending"
                    ? ` · vale até ${formatDateTime(invite.expiresAt)}`
                    : ""}
                </span>
              </div>
              <div className="row__side">
                <Badge tone={invite.status}>{STATUS_LABEL[invite.status]}</Badge>
                {allowed && (
                  <>
                    <button
                      className="button button--ghost button--small"
                      disabled={busy === invite.id}
                      onClick={() => void resend(invite)}
                    >
                      Reenviar
                    </button>
                    <button
                      className="button button--ghost button--small"
                      disabled={busy === invite.id}
                      onClick={() => setRevoking(invite)}
                    >
                      Cancelar convite
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Confirm
        open={revoking !== null}
        title="Cancelar convite"
        confirmLabel="Cancelar convite"
        danger
        busy={busy !== null}
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      >
        <p>
          O link enviado para <strong>{revoking?.email}</strong> deixa de funcionar. Dá para
          convidar de novo depois.
        </p>
      </Confirm>
    </>
  );
}

export function ConvitesEquipe() {
  const { data, error, loading, reload } = useLoad(
    () => orgApi<{ invites: TeamInvite[] }>("/invites"),
    [],
  );
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Convites pendentes"
        subtitle="Convites para a equipe e para anfitriões que ainda não foram aceitos. Cada link vale 7 dias e serve uma vez só."
        actions={
          <a className="button button--ghost" href={oh("/equipe")}>
            Equipe
          </a>
        }
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <InviteRows invites={data.invites} onChange={reload} /> : null}
    </div>
  );
}
