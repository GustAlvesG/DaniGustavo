import {
  CHECKIN_LINK_DEFAULT_HOURS,
  CHECKIN_POLL_MS,
  CheckinLinkInput,
  type CheckinArrivalResult,
  type CheckinLinkCreated,
  type CheckinLinkView,
  type CheckinLookupResult,
  type CheckinOverview,
} from "@casamento/shared";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../../api.ts";
import { useCan } from "../../event.tsx";
import { formatDateTime, plural } from "../../format.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  Modal,
  PageHeader,
  useLoad,
  useToast,
} from "../../ui.tsx";
import { Desk, Totals, type DeskApi } from "./Desk.tsx";
import "./checkin.css";

/*
 * Fase 7, frente A (docs/saas/fase-7.md): check-in no painel (`#/e/:id/checkin`). Contagem ao
 * vivo (polling), balcão de busca/chegada, links da portaria (gerar mostra link e PIN uma vez;
 * revogar derruba na hora) e as marcações recentes com desfazer.
 */

const HOURS = [
  { value: 12, label: "12 horas" },
  { value: 24, label: "24 horas" },
  { value: 48, label: "48 horas" },
  { value: 72, label: "3 dias" },
  { value: 168, label: "7 dias" },
];

const STATUS: Record<CheckinLinkView["status"], { tone: string; label: string }> = {
  active: { tone: "ok", label: "Ativo" },
  expired: { tone: "muted", label: "Vencido" },
  revoked: { tone: "muted", label: "Revogado" },
};

export function Checkin() {
  const toast = useToast();
  const canManage = useCan("checkin.manage");
  const { data, setData, error, loading, reload } = useLoad(
    () => api<CheckinOverview>("/checkin"),
    [],
  );
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CheckinLinkCreated | null>(null);
  const [revoking, setRevoking] = useState<CheckinLinkView | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    () =>
      api<CheckinOverview>("/checkin")
        .then(setData)
        .catch(() => undefined),
    [setData],
  );

  // Contagem ao vivo: recarrega a visão geral a cada CHECKIN_POLL_MS com a aba visível.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, CHECKIN_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const deskApi = useMemo<DeskApi>(
    () => ({
      lookup: (query) =>
        api<CheckinLookupResult>(
          `/checkin/invitations?${new URLSearchParams(query as Record<string, string>)}`,
        ),
      arrive: async (ref, people) => {
        const r = await send<CheckinArrivalResult>("POST", "/checkin/arrivals", { ref, people });
        void refresh();
        return r;
      },
      undo: async (id) => {
        const r = await send<CheckinArrivalResult>("POST", `/checkin/arrivals/${id}/undo`);
        void refresh();
        return r;
      },
    }),
    [refresh],
  );

  async function undoRecent(id: number, label: string) {
    try {
      await send("POST", `/checkin/arrivals/${id}/undo`);
      toast(`${label}: chegada desfeita.`);
      void refresh();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function revoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await send("POST", `/checkin/links/${revoking.id}/revoke`);
      toast(`Link “${revoking.label}” revogado. Quem estava usando sai na hora.`);
      setRevoking(null);
      void refresh();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Check-in"
        subtitle="Marque quem chegou e acompanhe a contagem ao vivo. A portaria entra por link e PIN, sem conta."
      />
      <Totals totals={data?.totals ?? null} />
      <Desk
        api={deskApi}
        canManage={canManage}
        onTotals={(totals) => data && setData({ ...data, totals })}
      />

      <section className="card stack" aria-labelledby="links-title">
        <div className="card__head">
          <h2 id="links-title">Links da portaria</h2>
          {canManage && (
            <button className="button button--small" onClick={() => setCreating(true)}>
              Novo link
            </button>
          )}
        </div>
        <p className="muted small">
          Cada link vem com um PIN de 6 números, mostrado uma vez só. A portaria vê nomes, mesa e
          aviso do convite — nunca telefone, e-mail ou restrição alimentar.
        </p>
        {data && data.links.length === 0 ? (
          <p className="empty">Nenhum link ainda.</p>
        ) : (
          <ul className="rows checkin-recent">
            {data?.links.map((l) => (
              <li key={l.id} className={`row${l.status === "active" ? "" : " row--off"}`}>
                <div className="row__main">
                  <span className="row__title">{l.label}</span>
                  <span className="row__meta">
                    {l.status === "revoked"
                      ? `Revogado em ${formatDateTime(l.revokedAt)}`
                      : `${l.status === "active" ? "Vale até" : "Venceu em"} ${formatDateTime(l.expiresAt)}`}
                    {l.lastUsedAt ? ` · último acesso ${formatDateTime(l.lastUsedAt)}` : ""}
                    {l.lockedUntil
                      ? ` · bloqueado por PIN errado até ${formatDateTime(l.lockedUntil)}`
                      : ""}
                  </span>
                </div>
                <div className="row__side">
                  <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                  {canManage && l.status === "active" && (
                    <button
                      className="button button--small button--danger-ghost"
                      onClick={() => setRevoking(l)}
                    >
                      Revogar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack checkin-recent" aria-labelledby="recent-title">
        <h2 id="recent-title">Últimas chegadas</h2>
        {data && data.recent.length === 0 ? (
          <p className="empty">Ninguém chegou ainda.</p>
        ) : (
          <ul className="rows">
            {data?.recent.map((a) => (
              <li key={a.id} className={`row${a.undoneAt ? " row--off" : ""}`}>
                <div className="row__main">
                  <span className="row__title">{a.invitationLabel}</span>
                  <span className="row__meta">
                    {plural(a.people, "pessoa", "pessoas")} · {formatDateTime(a.at)} · {a.by}
                    {a.undoneAt ? ` · desfeita em ${formatDateTime(a.undoneAt)}` : ""}
                  </span>
                </div>
                {canManage && !a.undoneAt && (
                  <div className="row__side">
                    <button
                      className="button button--small button--ghost"
                      onClick={() => undoRecent(a.id, a.invitationLabel)}
                    >
                      Desfazer
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewLinkModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          setCreated(c);
          void refresh();
        }}
      />
      <CreatedModal created={created} onClose={() => setCreated(null)} />
      <Confirm
        open={revoking !== null}
        title="Revogar link da portaria?"
        confirmLabel="Revogar"
        danger
        busy={busy}
        onConfirm={revoke}
        onCancel={() => setRevoking(null)}
      >
        <p>
          Quem estiver usando “{revoking?.label}” sai na hora e o link deixa de funcionar. As
          chegadas já marcadas continuam.
        </p>
      </Confirm>
    </div>
  );
}

function NewLinkModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: CheckinLinkCreated) => void;
}) {
  const [label, setLabel] = useState("Portaria principal");
  const [hours, setHours] = useState(CHECKIN_LINK_DEFAULT_HOURS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const check = CheckinLinkInput.safeParse({ label, hours });
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Confira o formulário.");
      return;
    }
    setBusy(true);
    try {
      onCreated(await send<CheckinLinkCreated>("POST", "/checkin/links", check.data));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Novo link da portaria" open={open} onClose={onClose}>
      <form className="stack" onSubmit={onSubmit}>
        <Field label="Nome do link" hint="Para a equipe saber de onde veio cada chegada.">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={64} required />
        </Field>
        <Field label="Vale por">
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {HOURS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </Field>
        <FormError message={error} />
        <div className="actions actions--end">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Gerando…" : "Gerar link e PIN"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreatedModal({
  created,
  onClose,
}: {
  created: CheckinLinkCreated | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copiado.`);
    } catch {
      toast("Não deu para copiar. Selecione e copie à mão.", "error");
    }
  };
  return (
    <Modal title="Link da portaria pronto" open={created !== null} onClose={onClose}>
      {created && (
        <div className="stack">
          <p className="alert alert--info">
            Anote o PIN e o link agora: eles não aparecem de novo. Perdeu? Revogue e gere outro.
          </p>
          <div className="checkin-secret">
            <span className="field__label">Link</span>
            <div className="copy-box">
              <input
                readOnly
                value={created.url}
                aria-label="Link da portaria"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="button" onClick={() => copy(created.url, "Link")}>
                Copiar
              </button>
            </div>
          </div>
          <div className="checkin-secret">
            <span className="field__label">PIN</span>
            <p className="checkin-pin" data-testid="checkin-pin">
              {created.pin}
            </p>
          </div>
          <p className="muted small">
            Vale até {formatDateTime(created.link.expiresAt)}. Mande o link e o PIN por canais
            diferentes (ex.: link pelo WhatsApp, PIN falado).
          </p>
          <div className="actions actions--end">
            <button className="button" onClick={onClose}>
              Pronto, anotei
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
