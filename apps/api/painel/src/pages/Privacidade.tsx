import {
  PRIVACY_REQUEST_KIND_LABELS,
  type AnonymizeResult,
  type PrivacyOverview,
  type PrivacyRequestView,
  type PrivacySettings,
  type PrivacySubjectsResponse,
} from "@casamento/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { useCan } from "../event.tsx";
import { formatBRL, formatDate, formatDateTime, plural } from "../format.ts";
import { ea } from "../nav.ts";
import {
  Badge,
  Confirm,
  ErrorBox,
  Field,
  FormError,
  Loading,
  PageHeader,
  useLoad,
  useToast,
} from "../ui.tsx";

const STATUS_LABEL: Record<PrivacyRequestView["status"], string> = {
  open: "Aberto",
  done: "Atendido",
  rejected: "Recusado",
};
const STATUS_TONE: Record<PrivacyRequestView["status"], string> = {
  open: "warn",
  done: "ok",
  rejected: "muted",
};

/**
 * Privacidade do evento (Fase 6, LGPD): pedidos dos titulares, busca de um titular para exportar
 * ou anonimizar os dados dele, exportação completa e as regras (aceite obrigatório, contato,
 * retenção). Quem só tem `privacy.read` vê, mas não mexe.
 */
export function Privacidade() {
  const canManage = useCan("privacy.manage");
  const { data, setData, error, loading, reload } = useLoad(
    () => api<PrivacyOverview>("/privacy"),
    [],
  );
  const refresh = () => void api<PrivacyOverview>("/privacy").then(setData);

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Privacidade"
        subtitle={
          data
            ? `${plural(data.openRequests, "pedido aberto", "pedidos abertos")}. Os dados dos convidados são de quem organiza o evento; aqui ficam os pedidos deles e as regras de guarda.`
            : undefined
        }
        actions={
          canManage ? (
            <>
              <a className="button button--ghost" href={ea("/privacy/export")} download>
                Exportar tudo (JSON)
              </a>
              <a className="button button--ghost" href={ea("/privacy/export?format=csv")} download>
                Exportar tudo (CSV)
              </a>
            </>
          ) : undefined
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : null}
      {data ? (
        <>
          <Pedidos canManage={canManage} onChange={refresh} />
          <Titular canManage={canManage} />
          <Regras overview={data} canManage={canManage} onSaved={setData} />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Pedidos dos titulares                                                     */
/* ------------------------------------------------------------------------ */

function Pedidos({ canManage, onChange }: { canManage: boolean; onChange: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<"open" | "">("open");
  const { data, setData, error, loading, reload } = useLoad(
    () =>
      api<{ requests: PrivacyRequestView[] }>(
        `/privacy/requests${status ? `?status=${status}` : ""}`,
      ),
    [status],
  );
  const [answer, setAnswer] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function resolve(r: PrivacyRequestView, next: "done" | "rejected") {
    setBusy(r.id);
    try {
      const { request } = await send<{ request: PrivacyRequestView }>(
        "PATCH",
        `/privacy/requests/${r.id}`,
        { status: next, response: answer[r.id]?.trim() || null },
      );
      setData((d) =>
        d
          ? {
              requests: status
                ? d.requests.filter((x) => x.id !== r.id)
                : d.requests.map((x) => (x.id === r.id ? request : x)),
            }
          : d,
      );
      toast(next === "done" ? "Pedido marcado como atendido." : "Pedido recusado.");
      onChange();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card stack" aria-labelledby="priv-pedidos">
      <div>
        <h2 id="priv-pedidos">Pedidos dos titulares</h2>
        <p className="muted small">
          Chegam pela página Privacidade do site. A LGPD dá até 15 dias para responder; a resposta
          vai por e-mail para quem pediu.
        </p>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ["open", "Abertos"],
            ["", "Todos"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={status === value}
            className="tab"
            onClick={() => setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : null}
      {data && data.requests.length === 0 ? (
        <p className="empty">{status ? "Nenhum pedido aberto." : "Nenhum pedido até agora."}</p>
      ) : null}
      {data && data.requests.length > 0 ? (
        <ul className="rows" data-testid="privacidade-pedidos">
          {data.requests.map((r) => (
            <li key={r.id} className="row">
              <div className="row__main stack">
                <span className="row__title">
                  {PRIVACY_REQUEST_KIND_LABELS[r.kind]} · {r.name}{" "}
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </span>
                <span className="row__meta">
                  {r.email} · {formatDateTime(r.createdAt)}
                </span>
                {r.message ? <p className="small">{r.message}</p> : null}
                {r.response ? <p className="muted small">Resposta: {r.response}</p> : null}
                {r.status === "open" && canManage ? (
                  <>
                    <Field label="Resposta para quem pediu" hint="Opcional. Vai no e-mail.">
                      <textarea
                        rows={2}
                        maxLength={5000}
                        value={answer[r.id] ?? ""}
                        onChange={(e) => setAnswer((a) => ({ ...a, [r.id]: e.target.value }))}
                      />
                    </Field>
                    <div className="actions">
                      <button
                        type="button"
                        className="button button--small"
                        disabled={busy === r.id}
                        onClick={() => void resolve(r, "done")}
                      >
                        Marcar como atendido
                      </button>
                      <button
                        type="button"
                        className="button button--small button--ghost"
                        disabled={busy === r.id}
                        onClick={() => void resolve(r, "rejected")}
                      >
                        Recusar
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Um titular: exportar ou anonimizar                                        */
/* ------------------------------------------------------------------------ */

function Titular({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<PrivacySubjectsResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [inv, setInv] = useState<number[]>([]);
  const [ord, setOrd] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setFormError(null);
    if (q.trim().length < 2) return setFormError("Digite pelo menos 2 letras do nome ou e-mail.");
    setSearching(true);
    try {
      setResult(
        await api<PrivacySubjectsResponse>(`/privacy/subjects?q=${encodeURIComponent(q.trim())}`),
      );
      setInv([]);
      setOrd([]);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  async function anonymize() {
    setBusy(true);
    try {
      const r = await send<AnonymizeResult>("POST", "/privacy/anonymize", {
        invitationIds: inv,
        orderIds: ord,
      });
      toast(
        `Anonimizados: ${plural(r.invitations, "convite", "convites")} e ${plural(r.orders, "pedido", "pedidos")}.`,
      );
      setConfirming(false);
      await search();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (list: number[], set: (v: number[]) => void, id: number, on: boolean) =>
    set(on ? [...list, id] : list.filter((x) => x !== id));
  const chosen = inv.length + ord.length;
  const exportUrl = (csv: boolean) =>
    ea(
      `/privacy/export?invitationIds=${inv.join(",")}&orderIds=${ord.join(",")}${csv ? "&format=csv" : ""}`,
    );

  return (
    <section className="card stack" aria-labelledby="priv-titular">
      <div>
        <h2 id="priv-titular">Encontrar um titular</h2>
        <p className="muted small">
          Busque pelo nome ou e-mail para ver onde a pessoa aparece no evento, exportar os dados
          dela (pedido de acesso) ou anonimizar (pedido de exclusão). Anonimizar troca nomes,
          contatos e recados por marcadores; os valores dos presentes ficam.
        </p>
      </div>
      <form className="actions" onSubmit={(e) => void search(e)} noValidate>
        <input
          aria-label="Nome ou e-mail"
          placeholder="Nome ou e-mail"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="button button--ghost" type="submit" disabled={searching}>
          {searching ? "Buscando…" : "Buscar"}
        </button>
      </form>
      <FormError message={formError} />
      {result && result.invitations.length + result.orders.length === 0 ? (
        <p className="empty">Ninguém encontrado com essa busca.</p>
      ) : null}
      {result && result.invitations.length > 0 ? (
        <div className="stack">
          <h3>Convites</h3>
          {result.invitations.map((i) => (
            <label key={`i${i.id}`} className="check">
              <input
                type="checkbox"
                checked={inv.includes(i.id)}
                disabled={i.anonymized || !canManage}
                onChange={(e) => toggle(inv, setInv, i.id, e.target.checked)}
              />
              {i.label} ({i.guests.join(", ") || "sem convidados"})
              {i.contactEmail ? ` · ${i.contactEmail}` : ""}
              {i.anonymized ? " · já anonimizado" : ""}
            </label>
          ))}
        </div>
      ) : null}
      {result && result.orders.length > 0 ? (
        <div className="stack">
          <h3>Presentes</h3>
          {result.orders.map((o) => (
            <label key={`o${o.id}`} className="check">
              <input
                type="checkbox"
                checked={ord.includes(o.id)}
                disabled={o.anonymized || !canManage}
                onChange={(e) => toggle(ord, setOrd, o.id, e.target.checked)}
              />
              {o.buyerName} · {o.buyerEmail} · {formatBRL(o.amountCents)} ·{" "}
              {formatDate(o.createdAt)}
              {o.anonymized ? " · já anonimizado" : ""}
              {o.status === "pending" ? " · pendente (não anonimiza)" : ""}
            </label>
          ))}
        </div>
      ) : null}
      {canManage && chosen > 0 ? (
        <div className="actions">
          <a className="button button--ghost" href={exportUrl(false)} download>
            Exportar escolhidos (JSON)
          </a>
          <a className="button button--ghost" href={exportUrl(true)} download>
            Exportar escolhidos (CSV)
          </a>
          <button
            type="button"
            className="button button--danger"
            onClick={() => setConfirming(true)}
          >
            Anonimizar escolhidos
          </button>
        </div>
      ) : null}
      <Confirm
        open={confirming}
        title="Anonimizar dados"
        confirmLabel="Anonimizar"
        danger
        busy={busy}
        onConfirm={() => void anonymize()}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {plural(inv.length, "convite", "convites")} e {plural(ord.length, "pedido", "pedidos")}{" "}
          vão perder nomes, contatos, restrições e recados. Não dá para desfazer. Exporte antes se a
          pessoa pediu uma cópia.
        </p>
      </Confirm>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Regras                                                                    */
/* ------------------------------------------------------------------------ */

function Regras({
  overview,
  canManage,
  onSaved,
}: {
  overview: PrivacyOverview;
  canManage: boolean;
  onSaved: (o: PrivacyOverview) => void;
}) {
  const toast = useToast();
  const s = overview.settings;
  const [requireConsent, setRequireConsent] = useState(s.requireConsent);
  const [contactEmail, setContactEmail] = useState(s.contactEmail ?? "");
  const [keep, setKeep] = useState(s.retentionDays !== null);
  const [days, setDays] = useState(String(s.retentionDays ?? 365));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setRequireConsent(s.requireConsent);
    setContactEmail(s.contactEmail ?? "");
    setKeep(s.retentionDays !== null);
    setDays(String(s.retentionDays ?? 365));
  }, [s.requireConsent, s.contactEmail, s.retentionDays]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const n = Number(days);
    if (keep && (!Number.isInteger(n) || n < 30 || n > 3650)) {
      return setFormError("Prazo: use um número inteiro de dias entre 30 e 3650.");
    }
    setSaving(true);
    try {
      const body: PrivacySettings = {
        requireConsent,
        contactEmail: contactEmail.trim() || null,
        retentionDays: keep ? n : null,
      };
      await send<{ settings: PrivacySettings }>("PUT", "/privacy/settings", body);
      onSaved(await api<PrivacyOverview>("/privacy"));
      toast("Regras de privacidade salvas.");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save} noValidate aria-labelledby="priv-regras">
      <div>
        <h2 id="priv-regras">Regras</h2>
        <p className="muted small">
          Versão do aviso de privacidade em uso: {overview.noticeVersion}.{" "}
          {overview.purgedAt
            ? `Os dados pessoais foram anonimizados em ${formatDateTime(overview.purgedAt)}.`
            : overview.retentionDueAt
              ? `Pela regra atual, os dados pessoais serão anonimizados em ${formatDate(overview.retentionDueAt)}.`
              : "Sem anonimização automática."}
        </p>
      </div>
      <fieldset className="stack" disabled={!canManage}>
        <label className="check">
          <input
            type="checkbox"
            checked={requireConsent}
            onChange={(e) => setRequireConsent(e.target.checked)}
          />
          Exigir o aceite do aviso de privacidade na confirmação de presença e no mural
        </label>
        <Field
          label="E-mail para assuntos de privacidade"
          hint="Aparece na página Privacidade do site. Vazio = o e-mail de contato do evento."
        >
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </Field>
        <label className="check">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          Anonimizar sozinho depois do evento
        </label>
        <Field label="Quantos dias depois do evento" hint="Entre 30 e 3650. Padrão: 365 (1 ano).">
          <input
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={!keep}
          />
        </Field>
      </fieldset>
      <FormError message={formError} />
      {canManage ? (
        <div>
          <button className="button" type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar regras"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
