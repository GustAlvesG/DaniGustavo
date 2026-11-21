import type {
  OrgPaymentAccountsView,
  PaymentAccountInput,
  PaymentAccountView,
} from "@casamento/shared";
import { PAYMENT_ACCOUNT_STATUS_LABELS, PLATFORM_NAME } from "@casamento/shared";
import { useState } from "react";
import { errorMessage, orgApi, orgSend } from "../../api.ts";
import { formatDate } from "../../format.ts";
import { oh } from "../../nav.ts";
import { useOrg } from "../../org.tsx";
import { Badge, Confirm, ErrorBox, Loading, PageHeader, useLoad, useToast } from "../../ui.tsx";
import { ContaRecebimentoForm } from "../ContaRecebimentoForm.tsx";
import { SituacaoConta } from "../recebimentos/SituacaoConta.tsx";

/*
 * Fase 5, frente C (docs/saas/fase-5.md): subconta da organização e contas das pessoas
 * (#/o/:orgId/recebimentos, #/o/:orgId/recebimentos/:id). Só o dono cadastra e desativa; o
 * membro vê a situação.
 */

const TONE: Record<PaymentAccountView["status"], string> = {
  pending: "warn",
  awaiting_approval: "info",
  approved: "ok",
  rejected: "error",
  disabled: "muted",
};

function DesativarConta({
  account,
  onDone,
}: {
  account: PaymentAccountView;
  onDone: (a: PaymentAccountView) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function disable() {
    setBusy(true);
    try {
      const res = await orgSend<{ account: PaymentAccountView }>(
        "POST",
        `/payment-accounts/${account.id}/disable`,
      );
      toast("Conta desativada.");
      setOpen(false);
      onDone(res.account);
    } catch (err) {
      toast(errorMessage(err), "error");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button button--danger-ghost" onClick={() => setOpen(true)}>
        Desativar conta
      </button>
      <Confirm
        open={open}
        title="Desativar esta conta?"
        confirmLabel="Desativar"
        danger
        busy={busy}
        onConfirm={disable}
        onCancel={() => setOpen(false)}
      >
        <p>
          A conta deixa de receber novos presentes. Ela não é apagada no provedor e os pedidos já
          feitos continuam nela.
        </p>
      </Confirm>
    </>
  );
}

function ContaDetalhe({ id }: { id: number }) {
  const org = useOrg();
  const canManage = org.role === "org_owner" || org.role === "platform_admin";
  const { data, setData, error, loading, reload } = useLoad(
    () => orgApi<{ account: PaymentAccountView }>(`/payment-accounts/${id}`),
    [id],
  );
  return (
    <div className="stack stack--lg">
      <PageHeader
        title={data?.account.name ?? "Conta de recebimento"}
        subtitle={
          data
            ? `${data.account.holder === "user" ? "Conta pessoal" : "Conta da organização"} · ${data.account.documentHint}`
            : undefined
        }
        actions={
          <a className="button button--ghost" href={oh("/recebimentos")}>
            Voltar aos recebimentos
          </a>
        }
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <SituacaoConta
            account={data.account}
            refreshPath={`/payment-accounts/${id}/refresh`}
            onChange={(account) => setData({ account })}
          />
          {canManage && !data.account.disabledAt ? (
            <div className="actions">
              <DesativarConta account={data.account} onDone={(account) => setData({ account })} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ListaContas() {
  const org = useOrg();
  const toast = useToast();
  const canManage = org.role === "org_owner" || org.role === "platform_admin";
  const { data, setData, error, loading, reload } = useLoad(
    () => orgApi<OrgPaymentAccountsView>("/payment-accounts"),
    [],
  );

  async function create(input: PaymentAccountInput) {
    await orgSend<{ account: PaymentAccountView }>("POST", "/payment-accounts", input);
    toast("Conta cadastrada. Acompanhe a situação cadastral abaixo.");
    reload();
  }

  const mine = data?.organizationAccount ?? null;
  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Recebimentos"
        subtitle="Onde cai o dinheiro dos presentes dos eventos da organização."
      />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <p className="muted small">
            O {PLATFORM_NAME} retém {String(data.platformFeePercent).replace(".", ",")}% de cada
            presente pago (o valor aparece em cada pedido). A cobrança e o saque ficam na conta do
            provedor ({data.provider === "asaas" ? "Asaas" : "simulado"}).
          </p>
          {mine ? (
            <section className="stack" aria-labelledby="rec-org">
              <h2 id="rec-org">Conta da organização</h2>
              <p className="muted">
                {mine.name} · {mine.documentHint}
              </p>
              <SituacaoConta
                account={mine}
                refreshPath={`/payment-accounts/${mine.id}/refresh`}
                onChange={(account) =>
                  setData((cur) => (cur ? { ...cur, organizationAccount: account } : cur))
                }
              />
              {canManage ? (
                <div className="actions">
                  <DesativarConta account={mine} onDone={reload} />
                </div>
              ) : null}
            </section>
          ) : canManage ? (
            <ContaRecebimentoForm onSubmit={create} />
          ) : (
            <p className="alert alert--info">
              A organização ainda não tem conta de recebimento. Só o dono pode cadastrar.
            </p>
          )}

          <section className="stack" aria-labelledby="rec-pessoas">
            <h2 id="rec-pessoas">Contas de pessoas</h2>
            {data.userAccounts.length === 0 ? (
              <p className="empty">
                Nenhum anfitrião cadastrou conta própria. Para liberar, marque a opção nas
                permissões do anfitrião do evento.
              </p>
            ) : (
              <ul className="rows">
                {data.userAccounts.map((a) => (
                  <li key={a.id} className="row" data-testid="conta-pessoa">
                    <div className="row__main">
                      <span className="row__title">{a.user?.name ?? a.name}</span>
                      <span className="row__meta">
                        {a.documentHint} · desde {formatDate(a.createdAt)}
                      </span>
                    </div>
                    <div className="row__side">
                      <Badge tone={TONE[a.status]}>{PAYMENT_ACCOUNT_STATUS_LABELS[a.status]}</Badge>
                      <a
                        className="button button--ghost button--small"
                        href={oh(`/recebimentos/${a.id}`)}
                      >
                        Ver
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function OrgRecebimentos({ id }: { id?: number }) {
  return id ? <ContaDetalhe id={id} /> : <ListaContas />;
}
