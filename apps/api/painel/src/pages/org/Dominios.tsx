import type { EventDomainView, EventDomainsResponse } from "@casamento/shared";
import { useState, type FormEvent } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { formatDateTime } from "../../format.ts";
import { oh } from "../../nav.ts";
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
} from "../../ui.tsx";

/*
 * Fase 6, frente B (docs/saas/fase-6.md): domínios de um evento da organização.
 * Endereço automático `<slug>.<base>` (quando a plataforma tem domínio base) e domínio próprio,
 * que só passa a abrir o site depois que o registro TXT de verificação aparece no DNS.
 */

export function Dominios({ eventId }: { eventId: number }) {
  const toast = useToast();
  const base = `/events/${eventId}/domains`;
  const { data, error, loading, reload } = useLoad(
    () => orgApi<EventDomainsResponse>(base),
    [eventId],
  );
  const [removing, setRemoving] = useState<EventDomainView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try {
      toast(await fn());
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  const verify = (d: EventDomainView) =>
    act(`v${d.id}`, async () => {
      const { domain } = await orgSend<{ domain: EventDomainView }>(
        "POST",
        `${base}/${d.id}/verify`,
      );
      return domain.verified
        ? `${domain.host} verificado. O site já abre por ele.`
        : (domain.checkError ?? "Ainda não deu certo. Confira o registro e tente de novo.");
    });

  const primary = (d: EventDomainView) =>
    act(`p${d.id}`, async () => {
      await orgSend("POST", `${base}/${d.id}/primary`);
      return `${d.host} agora é o endereço principal do evento.`;
    });

  const createPlatform = () =>
    act("platform", async () => {
      const { domain } = await orgSend<{ domain: EventDomainView }>("POST", `${base}/platform`);
      return `Endereço ${domain.host} criado.`;
    });

  async function remove() {
    if (!removing) return;
    const target = removing;
    await act(`r${target.id}`, async () => {
      await orgSend("DELETE", `${base}/${target.id}`);
      return `${target.host} removido.`;
    });
    setRemoving(null);
  }

  const hasPlatform = data?.domains.some((d) => d.kind === "platform") ?? false;

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Domínios do evento"
        subtitle="Os endereços em que o site dos convidados abre. O principal é o que vai nos convites, e-mails e QR codes."
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
          {data.domains.length === 0 ? (
            <p className="empty">
              Este evento ainda não tem endereço. Crie o endereço da plataforma ou cadastre um
              domínio próprio.
            </p>
          ) : (
            <ul className="rows">
              {data.domains.map((d) => (
                <li key={d.id} className="row" data-testid="dominio">
                  <div className="row__main">
                    <span className="row__title">
                      {d.host} {d.isPrimary ? <Badge tone="info">Principal</Badge> : null}{" "}
                      {d.verified ? (
                        <Badge tone="ok">Verificado</Badge>
                      ) : (
                        <Badge tone="warn">Aguardando DNS</Badge>
                      )}
                    </span>
                    <span className="row__meta">
                      {d.kind === "platform" ? "Endereço da plataforma" : "Domínio próprio"}
                      {d.lastCheckedAt
                        ? ` · última verificação em ${formatDateTime(d.lastCheckedAt)}`
                        : ""}
                    </span>
                    {d.checkError && !d.verified ? (
                      <span className="row__meta" role="status">
                        {d.checkError}
                      </span>
                    ) : null}
                    {d.verification ? <DnsInstructions domain={d} /> : null}
                  </div>
                  <div className="row__side row__side--stack">
                    {!d.verified ? (
                      <button
                        className="button button--small"
                        disabled={busy !== null}
                        onClick={() => void verify(d)}
                      >
                        {busy === `v${d.id}` ? "Verificando…" : "Verificar agora"}
                      </button>
                    ) : null}
                    {d.verified && !d.isPrimary ? (
                      <button
                        className="button button--ghost button--small"
                        disabled={busy !== null}
                        onClick={() => void primary(d)}
                      >
                        Tornar principal
                      </button>
                    ) : null}
                    <button
                      className="button button--ghost button--small"
                      disabled={busy !== null}
                      onClick={() => setRemoving(d)}
                    >
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <section className="card stack" aria-labelledby="dominio-plataforma">
            <h2 id="dominio-plataforma">Endereço da plataforma</h2>
            {data.baseDomain ? (
              hasPlatform ? (
                <p className="muted small">
                  Este evento já tem o endereço automático em {data.baseDomain}.
                </p>
              ) : (
                <>
                  <p className="muted small">
                    Um endereço pronto, sem mexer em DNS: o endereço do evento seguido de{" "}
                    <span className="mono">.{data.baseDomain}</span>.
                  </p>
                  <div>
                    <button
                      className="button"
                      disabled={busy !== null}
                      onClick={() => void createPlatform()}
                    >
                      {busy === "platform" ? "Criando…" : "Criar endereço da plataforma"}
                    </button>
                  </div>
                </>
              )
            ) : (
              <p className="muted small">
                Os endereços automáticos ainda não estão disponíveis nesta plataforma. Use um
                domínio próprio.
              </p>
            )}
          </section>

          <AddDomainForm base={base} onAdded={reload} />
        </>
      ) : null}
      <Confirm
        open={removing !== null}
        title="Remover domínio"
        confirmLabel="Remover"
        danger
        busy={busy !== null}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      >
        <p>
          O site deixa de abrir por <strong>{removing?.host}</strong> na hora. Links antigos com
          esse endereço param de funcionar.
        </p>
      </Confirm>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copiado.");
    } catch {
      toast("Não deu para copiar. Selecione o texto e copie à mão.", "error");
    }
  };
  return (
    <Field label={label}>
      <div className="copy-box">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => void copy()}
        >
          Copiar
        </button>
      </div>
    </Field>
  );
}

function DnsInstructions({ domain }: { domain: EventDomainView }) {
  const v = domain.verification!;
  return (
    <div className="stack" data-testid="dominio-instrucoes">
      <p className="small">
        No painel de DNS de onde você comprou o domínio, crie o registro abaixo. Depois clique em
        “Verificar agora” (a mudança pode levar de alguns minutos a algumas horas para aparecer).
      </p>
      <CopyField label="Registro TXT: nome" value={v.txtName} />
      <CopyField label="Registro TXT: valor" value={v.txtValue} />
      {v.target ? (
        <p className="small">
          E aponte o domínio para a plataforma: registro <strong>CNAME</strong> de{" "}
          <span className="mono">{domain.host}</span> para <span className="mono">{v.target}</span>{" "}
          (no domínio raiz, sem “www”, use o registro A ou ALIAS que o seu provedor indicar).
        </p>
      ) : null}
    </div>
  );
}

function AddDomainForm({ base, onAdded }: { base: string; onAdded: () => void }) {
  const toast = useToast();
  const [host, setHost] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const { domain } = await orgSend<{ domain: EventDomainView }>("POST", base, { host });
      toast(`${domain.host} cadastrado. Agora crie o registro TXT para verificar.`);
      setHost("");
      onAdded();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-labelledby="dominio-proprio">
      <div>
        <h2 id="dominio-proprio">Domínio próprio</h2>
        <p className="muted small">
          Tem um domínio, como anaebruno.com.br? Cadastre aqui e siga as instruções de DNS. Ele só
          passa a abrir o site depois de verificado.
        </p>
      </div>
      <Field label="Domínio">
        <input
          autoComplete="off"
          inputMode="url"
          placeholder="anaebruno.com.br"
          required
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
      </Field>
      <FormError message={formError} />
      <div>
        <button className="button" type="submit" disabled={saving || !host.trim()}>
          {saving ? "Cadastrando…" : "Cadastrar domínio"}
        </button>
      </div>
    </form>
  );
}
