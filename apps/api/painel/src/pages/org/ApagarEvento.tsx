import type { EventDeletionPreview } from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { ApiFailure, errorMessage, orgApi, orgSend } from "../../api.ts";
import { formatDate, plural } from "../../format.ts";
import { goOrg, oa, oh } from "../../nav.ts";
import { useOrg, useRefreshMe } from "../../org.tsx";
import { ErrorBox, Field, FormError, Loading, PageHeader, useLoad, useToast } from "../../ui.tsx";

/**
 * Apagar evento (Fase 6, docs/saas/fase-6.md §3): só o dono, só evento arquivado, sem pedido
 * pendente nem pago/reembolsado na janela de contestação. Mostra o que sai, oferece a exportação
 * antes e confirma digitando o endereço (slug) do evento. Fica só um resumo sem dado pessoal.
 */
export function ApagarEvento({ eventId }: { eventId: number }) {
  const toast = useToast();
  const refreshMe = useRefreshMe();
  const org = useOrg();
  const isOwner = org.role === "org_owner" || org.role === "platform_admin";
  const path = `/events/${eventId}/deletion`;
  const { data, error, loading, reload } = useLoad(
    () => (isOwner ? orgApi<EventDeletionPreview>(path) : Promise.resolve(null)),
    [eventId, isOwner],
  );
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setFormError(null);
    if (slug.trim() !== data.slug) {
      return setFormError(`Para confirmar, digite exatamente o endereço do evento: ${data.slug}`);
    }
    setBusy(true);
    try {
      await orgSend<{ ok: true }>("POST", path, { confirmSlug: slug.trim() });
      toast(`Evento ${data.name} apagado.`);
      await refreshMe();
      goOrg("/eventos");
    } catch (err) {
      setFormError(errorMessage(err));
      if (err instanceof ApiFailure && err.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="stack stack--lg">
        <PageHeader title="Apagar evento" />
        <p className="alert">Só quem é dono da organização pode apagar um evento.</p>
        <p>
          <a href={oh("/eventos")}>Voltar aos eventos</a>
        </p>
      </div>
    );
  }

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Apagar evento"
        subtitle={data ? `${data.name} · ${data.slug}` : undefined}
        actions={
          <a className="button button--ghost" href={oh("/eventos")}>
            Voltar aos eventos
          </a>
        }
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Loading /> : null}
      {data ? (
        <>
          <section className="card stack" aria-labelledby="apagar-o-que">
            <h2 id="apagar-o-que">O que sai</h2>
            <p>
              Tudo do evento, sem volta: {plural(data.counts.invitations, "convite", "convites")} (
              {plural(data.counts.guests, "convidado", "convidados")}),{" "}
              {plural(data.counts.orders, "pedido de presente", "pedidos de presente")},{" "}
              {plural(data.counts.messages, "recado", "recados")},{" "}
              {plural(data.counts.media, "foto", "fotos")},{" "}
              {plural(data.counts.contracts, "contrato", "contratos")}, tarefas, fornecedores do
              evento, orçamentos, cronograma, domínios e configurações. Os arquivos (inclusive os
              contratos) também são apagados.
            </p>
            <p className="muted small">
              Fica só um resumo sem dado pessoal (nome do evento, quantos presentes pagos, total e
              taxa), para a contabilidade da organização. As contas de recebimento são da
              organização e continuam.
            </p>
            <div className="actions">
              <a className="button button--ghost" href={oa(`${path}/export`)} download>
                Baixar os dados antes (JSON)
              </a>
              <a className="button button--ghost" href={oa(`${path}/export?format=csv`)} download>
                Baixar os dados antes (CSV)
              </a>
            </div>
          </section>

          {data.blockers.length > 0 ? (
            <section className="card stack" aria-labelledby="apagar-bloqueios">
              <h2 id="apagar-bloqueios">Ainda não dá para apagar</h2>
              <ul data-testid="apagar-bloqueios">
                {data.blockers.map((b) => (
                  <li key={b.code}>{b.message}</li>
                ))}
              </ul>
              {data.deletableFrom ? (
                <p className="muted small">
                  Liberado a partir de {formatDate(data.deletableFrom)}.
                </p>
              ) : null}
            </section>
          ) : (
            <form className="card stack" onSubmit={confirm} noValidate aria-labelledby="apagar-ok">
              <h2 id="apagar-ok">Confirmar</h2>
              <Field
                label={`Digite o endereço do evento (${data.slug}) para confirmar`}
                hint="É a parte do link que identifica o evento."
              >
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  data-testid="apagar-slug"
                />
              </Field>
              <FormError message={formError} />
              <div>
                <button
                  className="button button--danger"
                  type="submit"
                  disabled={busy || slug.trim() !== data.slug}
                >
                  {busy ? "Apagando…" : "Apagar o evento para sempre"}
                </button>
              </div>
            </form>
          )}
        </>
      ) : null}
    </div>
  );
}
