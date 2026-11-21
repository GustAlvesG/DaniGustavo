import type { KycDocumentGroup, KycDocumentStatus } from "@casamento/shared";
import { formatDateTime } from "../../format.ts";
import { Badge } from "../../ui.tsx";

/*
 * Fase 5, frente D: peças reutilizáveis da situação cadastral de uma subconta (a frente C usa
 * `SituacaoConta`; estas servem para quem quiser montar o próprio layout).
 */

export const DOCUMENT_STATUS_LABELS: Record<KycDocumentStatus, string> = {
  not_sent: "Não enviado",
  pending: "Em análise",
  approved: "Aprovado",
  rejected: "Recusado",
  ignored: "Dispensado",
};

const DOCUMENT_TONE: Record<KycDocumentStatus, string> = {
  not_sent: "warn",
  pending: "info",
  approved: "ok",
  rejected: "error",
  ignored: "muted",
};

/** Só links http(s) (ou o fictício do simulado) viram `<a>`: o resto é ignorado. */
export function safeOnboardingUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("about:blank#")) return url;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** O link do provedor vence; sem data, considera válido. */
export function onboardingExpired(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now.getTime();
}

/** Grupos de documentos que ainda dependem de quem cadastrou (não enviados ou recusados). */
export const pendingDocuments = (documents: KycDocumentGroup[]) =>
  documents.filter((d) => d.status === "not_sent" || d.status === "rejected");

/** Botão que leva ao envio de documentos no provedor (nova aba). */
export function BotaoOnboarding({
  url,
  expiresAt,
  label = "Enviar documentos",
}: {
  url: string | null;
  expiresAt: string | null;
  label?: string;
}) {
  const href = safeOnboardingUrl(url);
  if (!href) return null;
  if (onboardingExpired(expiresAt)) {
    return (
      <span className="muted">
        O link de envio venceu. Use “Atualizar situação” para receber um novo.
      </span>
    );
  }
  return (
    <span>
      <a className="button button--small" href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
      {expiresAt && <small className="muted"> Link válido até {formatDateTime(expiresAt)}.</small>}
    </span>
  );
}

/** Lista dos documentos pedidos pelo provedor, com situação e link de envio. */
export function ListaPendencias({ documents }: { documents: KycDocumentGroup[] }) {
  if (documents.length === 0) return null;
  return (
    <ul className="rows" aria-label="Documentos pedidos pelo provedor">
      {documents.map((d) => (
        <li className="row" key={d.id}>
          <div className="row__main">
            <div className="row__title">{d.title}</div>
            {d.description && <div className="row__meta">{d.description}</div>}
            {(d.status === "not_sent" || d.status === "rejected") && (
              <BotaoOnboarding url={d.onboardingUrl} expiresAt={d.onboardingUrlExpiresAt} />
            )}
          </div>
          <div className="row__side">
            <Badge tone={DOCUMENT_TONE[d.status]}>{DOCUMENT_STATUS_LABELS[d.status]}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
