import type { SubscriptionStatus, SubscriptionView } from "@casamento/shared";
import { PAST_DUE_GRACE_DAYS, SUBSCRIPTION_STATUS_LABELS } from "@casamento/shared";
import { orgApi } from "../../api.ts";
import { formatDate } from "../../format.ts";
import { oh } from "../../nav.ts";
import { Badge, useLoad } from "../../ui.tsx";

/* Fase 6, frente A: situação da assinatura (selo e aviso de atraso). */

const TONE: Record<SubscriptionStatus, string> = {
  trialing: "info",
  active: "ok",
  past_due: "error",
  canceled: "muted",
  internal: "info",
};

export function SituacaoAssinatura({ status }: { status: SubscriptionStatus }) {
  return <Badge tone={TONE[status]}>{SUBSCRIPTION_STATUS_LABELS[status]}</Badge>;
}

const DAY = 86_400_000;

export const COBRANCA_INATIVA =
  "Cobrança de assinaturas ainda não ativa: nenhuma fatura é gerada e o painel não fica bloqueado por atraso ou fim do teste. Os limites do plano continuam valendo.";

/** Texto do aviso (null = nada a avisar). */
export function avisoAssinatura(s: SubscriptionView, now = new Date()): string | null {
  // Cobrança ainda não ativa na plataforma: sem atraso nem fim de teste (a página do plano avisa).
  if (s.billingActive === false) return null;
  if (s.readOnly) {
    return s.status === "canceled"
      ? "A assinatura foi encerrada: o painel está só para consulta. Escolha um plano para voltar a editar. O site dos convidados continua no ar."
      : "O pagamento da assinatura está em atraso além da carência: o painel está só para consulta até a fatura ser paga. O site dos convidados, as confirmações e os presentes continuam funcionando.";
  }
  if (s.pastDueSince) {
    const ends = new Date(new Date(s.pastDueSince).getTime() + PAST_DUE_GRACE_DAYS * DAY);
    return `O pagamento da assinatura está em atraso. Regularize até ${formatDate(ends.toISOString())} para continuar editando no painel (o site dos convidados não sai do ar).`;
  }
  if (s.status === "trialing" && s.trialEndsAt) {
    const left = Math.ceil((new Date(s.trialEndsAt).getTime() - now.getTime()) / DAY);
    if (left <= 3) {
      return `O período de teste termina em ${formatDate(s.trialEndsAt)}. Escolha a forma de pagamento em Plano para não interromper o painel.`;
    }
  }
  if (s.status === "canceled" && s.currentPeriodEndsAt) {
    return `A assinatura foi cancelada e vale até ${formatDate(s.currentPeriodEndsAt)}.`;
  }
  return null;
}

/**
 * Aviso da assinatura para o topo do painel da organização (a integração monta no `Frame`).
 * Não mostra nada sem assinatura, sem atraso ou se a consulta falhar.
 */
export function AvisoAssinatura({ orgId }: { orgId: number }) {
  const { data } = useLoad(
    () => orgApi<SubscriptionView>("/subscription").catch(() => null),
    [orgId],
  );
  const text = data ? avisoAssinatura(data) : null;
  if (!text) return null;
  return (
    <div className={`alert ${data?.readOnly ? "alert--error" : "alert--info"}`} role="status">
      <p>{text}</p>
      <a className="button button--small" href={oh("/plano")}>
        Ver plano
      </a>
    </div>
  );
}
