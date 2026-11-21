import {
  KYC_STEP_STATUSES,
  PAYMENT_ACCOUNT_STATUS_LABELS,
  type KycStepStatus,
  type PaymentAccountView,
} from "@casamento/shared";
import { useState } from "react";
import { api, errorMessage, orgApi } from "../../api.ts";
import { formatDateTime } from "../../format.ts";
import { Badge, FormError, useToast } from "../../ui.tsx";
import { ListaPendencias } from "./Pendencias.tsx";

/**
 * Fase 5, frente D (docs/saas/fase-5.md): cartão da situação cadastral de uma subconta (status,
 * etapas, documentos pendentes com o link de envio do provedor, motivo da recusa e "Atualizar
 * situação"). As páginas da frente C usam este componente.
 */

const STEP_LABELS: Record<KycStepStatus, string> = {
  pending: "Pendente",
  awaiting_approval: "Em análise",
  approved: "Aprovada",
  rejected: "Recusada",
};

const STATUS_TONE: Record<PaymentAccountView["status"], string> = {
  pending: "warn",
  awaiting_approval: "info",
  approved: "ok",
  rejected: "error",
  disabled: "muted",
};

type SimulatedStatus = "pending" | "approved" | "rejected";

/** Botões do modo simulado (a API só aceita fora de produção, com PAYMENT_PROVIDER=simulado). */
const SIMULATED_ACTIONS: [SimulatedStatus, string][] = [
  ["approved", "Simular aprovação"],
  ["pending", "Simular pendência"],
  ["rejected", "Simular recusa"],
];

const STEPS = [
  ["commercialInfo", "Dados cadastrais"],
  ["bankAccountInfo", "Conta bancária"],
  ["documentation", "Documentos"],
] as const;

const GUIDANCE: Record<PaymentAccountView["status"], string> = {
  pending: "Faltam informações ou documentos. Envie o que está listado abaixo.",
  awaiting_approval: "O provedor está analisando o cadastro. Costuma levar até alguns dias úteis.",
  approved: "Tudo certo: esta conta já pode receber os presentes.",
  rejected: "O provedor recusou o cadastro. Veja o motivo e corrija pelo envio de documentos.",
  disabled: "Esta conta foi desativada e não recebe mais presentes.",
};

export function SituacaoConta({
  account,
  refreshPath,
  onChange,
  escopo = "org",
}: {
  account: PaymentAccountView;
  /** POST que consulta o provedor agora (ex.: `/payment-accounts/3/refresh`). */
  refreshPath: string;
  onChange?: (account: PaymentAccountView) => void;
  /** `org`: rota da organização (padrão); `evento`: rota do evento (conta do anfitrião). */
  escopo?: "org" | "evento";
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kyc = account.kyc;
  const disabled = account.status === "disabled" || Boolean(account.disabledAt);

  async function refresh(simulated?: SimulatedStatus) {
    setBusy(true);
    setError(null);
    try {
      const call = escopo === "org" ? orgApi : api;
      const res = await call<{ account: PaymentAccountView }>(
        simulated ? refreshPath.replace(/\/refresh$/, "/simulate") : refreshPath,
        simulated
          ? { method: "POST", body: JSON.stringify({ status: simulated }) }
          : { method: "POST" },
      );
      onChange?.(res.account);
      toast("Situação atualizada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-label="Situação cadastral da conta">
      <div className="card__head">
        <div>
          <h2>Situação cadastral</h2>
          <p className="muted">{GUIDANCE[account.status]}</p>
        </div>
        <Badge tone={STATUS_TONE[account.status]}>
          {PAYMENT_ACCOUNT_STATUS_LABELS[account.status]}
        </Badge>
      </div>

      {kyc && (
        <dl className="rows" aria-label="Etapas do cadastro">
          {STEPS.map(([key, label]) => {
            const step = kyc[key];
            if (!step || !KYC_STEP_STATUSES.includes(step)) return null;
            return (
              <div className="row" key={key}>
                <dt className="row__main">{label}</dt>
                <dd className="row__side">
                  <Badge tone={STATUS_TONE[step]}>{STEP_LABELS[step]}</Badge>
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {account.status === "rejected" && kyc?.rejectReason && (
        <p className="alert alert--error" role="alert">
          Motivo informado pelo provedor: {kyc.rejectReason}
        </p>
      )}

      {kyc && !disabled && account.status !== "approved" && (
        <ListaPendencias documents={kyc.documents} />
      )}

      <FormError message={error} />

      <div className="card__foot">
        <span className="muted">
          {account.statusCheckedAt
            ? `Consultada em ${formatDateTime(account.statusCheckedAt)}.`
            : "Ainda não consultada."}
        </span>
        {!disabled && (
          <button
            className="button button--ghost"
            type="button"
            onClick={() => refresh()}
            disabled={busy}
          >
            {busy ? "Consultando…" : "Atualizar situação"}
          </button>
        )}
      </div>

      {account.provider === "simulado" && !disabled && (
        <div className="card__foot" aria-label="Modo simulado">
          <span className="muted">Modo simulado (só em desenvolvimento):</span>
          {SIMULATED_ACTIONS.map(([status, label]) => (
            <button
              key={status}
              className="button button--ghost"
              type="button"
              onClick={() => refresh(status)}
              disabled={busy || account.status === status}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
