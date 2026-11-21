import {
  PAYMENT_ACCOUNT_STATUS_LABELS,
  PAYMENT_RECEIVER_LABELS,
  type EventPaymentView,
  type MyPaymentAccountView,
  type PaymentAccountInput,
  type PaymentReceiver,
} from "@casamento/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, send } from "../api.ts";
import { useEvent } from "../event.tsx";
import { Badge, ErrorBox, FormError, Loading, PageHeader, useLoad, useToast } from "../ui.tsx";
import { ContaRecebimentoForm } from "./ContaRecebimentoForm.tsx";
import { SituacaoConta } from "./recebimentos/SituacaoConta.tsx";

/*
 * Fase 5, frente C (docs/saas/fase-5.md): conta que recebe os presentes do evento
 * (#/recebimento): situação, recebedor (só a organização escolhe), a própria subconta do
 * anfitrião (quando a organização libera) e a taxa da plataforma.
 */

const STATE_TEXT: Record<EventPaymentView["state"], { tone: string; text: string }> = {
  ready: { tone: "ok", text: "Tudo certo: os presentes em dinheiro caem na conta abaixo." },
  platform: {
    tone: "info",
    text: "Os presentes caem na conta principal da plataforma, sem taxa.",
  },
  no_account: {
    tone: "warn",
    text: "Sem conta de recebimento: os presentes em dinheiro ficam indisponíveis no site.",
  },
  not_approved: {
    tone: "warn",
    text: "A conta ainda não foi aprovada pelo provedor: os presentes em dinheiro ficam indisponíveis no site até lá.",
  },
};

const TONE: Record<string, string> = {
  pending: "warn",
  awaiting_approval: "info",
  approved: "ok",
  rejected: "error",
  disabled: "muted",
};

function Recebedor({
  view,
  isPlatformAdmin,
  onSaved,
}: {
  view: EventPaymentView;
  isPlatformAdmin: boolean;
  onSaved: (v: EventPaymentView) => void;
}) {
  const toast = useToast();
  const [receiver, setReceiver] = useState<PaymentReceiver>(view.receiver);
  const [accountId, setAccountId] = useState<number | "">(
    view.receiver === "host" ? (view.account?.id ?? "") : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setReceiver(view.receiver);
    setAccountId(view.receiver === "host" ? (view.account?.id ?? "") : "");
  }, [view.receiver, view.account?.id]);

  const hostOptions = view.options.filter((o) => o.holder === "user");
  const receivers: PaymentReceiver[] = [
    "organization",
    "host",
    ...(isPlatformAdmin || view.receiver === "platform" ? (["platform"] as const) : []),
  ];

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        receiver === "host" ? { receiver, accountId: Number(accountId) || null } : { receiver };
      onSaved(await send<EventPaymentView>("PUT", "/payments/receiver", body));
      toast("Recebedor salvo.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save} noValidate aria-labelledby="rec-quem">
      <div>
        <h2 id="rec-quem">Quem recebe os presentes</h2>
        <p className="muted small">
          Só a organização escolhe. O dinheiro cai direto na conta escolhida, sem passar pela
          plataforma.
        </p>
      </div>
      {receivers.map((r) => (
        <label key={r} className="check">
          <input
            type="radio"
            name="recebedor"
            checked={receiver === r}
            disabled={r === "host" && hostOptions.length === 0}
            onChange={() => setReceiver(r)}
          />
          <span>
            {PAYMENT_RECEIVER_LABELS[r]}
            {r === "host" && hostOptions.length === 0 ? (
              <span className="muted small"> (nenhum anfitrião cadastrou conta)</span>
            ) : null}
          </span>
        </label>
      ))}
      {receiver === "host" && hostOptions.length > 0 ? (
        <label className="field">
          <span className="field__label">Conta do anfitrião</span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Escolha…</option>
            {hostOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.user?.name ?? o.name} · {PAYMENT_ACCOUNT_STATUS_LABELS[o.status]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <FormError message={error} />
      <div className="actions">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar recebedor"}
        </button>
      </div>
    </form>
  );
}

function MinhaConta({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad(
    () => api<MyPaymentAccountView>("/payments/my-account"),
    [],
  );
  // O SituacaoConta da frente D escolhe a rota pelo `escopo` ("evento" = rota do evento);
  // o stub da fundação ainda não declara a prop, então ela vai por espalhamento.
  const escopoEvento = { escopo: "evento" } as Record<string, unknown>;

  async function create(input: PaymentAccountInput) {
    await send("POST", "/payments/my-account", input);
    toast("Conta cadastrada. Acompanhe a situação cadastral abaixo.");
    reload();
    onChanged();
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <section className="stack" aria-labelledby="rec-minha">
      <h2 id="rec-minha">Minha conta de recebimento</h2>
      {data?.account ? (
        <SituacaoConta
          {...escopoEvento}
          account={data.account}
          refreshPath="/payments/my-account/refresh"
          onChange={(account) => setData({ account })}
        />
      ) : (
        <ContaRecebimentoForm onSubmit={create} />
      )}
    </section>
  );
}

export function Recebimento() {
  const event = useEvent();
  const { data, setData, error, loading, reload } = useLoad(
    () => api<EventPaymentView>("/payments"),
    [],
  );
  // `payments.own_account` é opt-in: sem a liberação a rota dá 403 e a seção não aparece.
  const [canOwn, setCanOwn] = useState(false);
  useEffect(() => {
    let alive = true;
    api<MyPaymentAccountView>("/payments/my-account")
      .then(() => alive && setCanOwn(true))
      .catch(() => alive && setCanOwn(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Recebimento"
        subtitle="Para onde vai o dinheiro dos presentes deste evento."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <section
            className="card stack"
            aria-labelledby="rec-sit"
            data-testid="recebimento-situacao"
          >
            <h2 id="rec-sit">Situação</h2>
            <p className={`alert alert--${STATE_TEXT[data.state].tone}`}>
              {STATE_TEXT[data.state].text}
            </p>
            <dl className="details">
              <div>
                <dt>Recebedor</dt>
                <dd>{PAYMENT_RECEIVER_LABELS[data.receiver]}</dd>
              </div>
              <div>
                <dt>Conta</dt>
                <dd>
                  {data.account ? (
                    <>
                      {data.account.user?.name ?? data.account.name}{" "}
                      <Badge tone={TONE[data.account.status] ?? "muted"}>
                        {PAYMENT_ACCOUNT_STATUS_LABELS[data.account.status]}
                      </Badge>
                    </>
                  ) : data.receiver === "platform" ? (
                    "Conta principal da plataforma"
                  ) : (
                    "Nenhuma"
                  )}
                </dd>
              </div>
              <div>
                <dt>Taxa da plataforma</dt>
                <dd>{String(data.platformFeePercent).replace(".", ",")}% de cada presente pago</dd>
              </div>
            </dl>
          </section>
          {data.canConfigure ? (
            <Recebedor
              view={data}
              isPlatformAdmin={event.role === "platform_admin"}
              onSaved={setData}
            />
          ) : (
            <p className="muted small">
              Quem escolhe a conta que recebe é a organização do evento.
            </p>
          )}
        </>
      ) : null}
      {canOwn ? <MinhaConta onChanged={reload} /> : null}
    </div>
  );
}
