import type { AdminMessage } from "@casamento/shared";
import { useState } from "react";
import { api, errorMessage, send } from "../api.ts";
import { formatDateTime } from "../format.ts";
import { Badge, ErrorBox, Loading, PageHeader, useLoad, useToast } from "../ui.tsx";

const TABS = [
  { value: "pending", label: "Aguardando" },
  { value: "approved", label: "Aprovados" },
  { value: "all", label: "Todos" },
] as const;

export function Recados() {
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("pending");
  const { data, setData, error, loading, reload } = useLoad(
    () => api<{ messages: AdminMessage[] }>(`/messages?status=${tab}`),
    [tab],
  );

  async function setApproved(m: AdminMessage, approved: boolean) {
    try {
      await send("PATCH", `/messages/${m.id}`, { approved });
      toast(approved ? `Recado de ${m.author} aprovado.` : `Recado de ${m.author} ocultado.`);
      if (data) {
        const updated = data.messages.map((x) => (x.id === m.id ? { ...x, approved } : x));
        setData({
          messages:
            tab === "all" ? updated : updated.filter((x) => x.approved === (tab === "approved")),
        });
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="stack stack--lg">
      <PageHeader title="Recados" subtitle="Só os recados aprovados podem aparecer no site." />
      <div className="tabs" role="tablist" aria-label="Filtrar recados">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            className="tab"
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : data && data.messages.length === 0 ? (
        <p className="empty">
          {tab === "pending" ? "Nenhum recado esperando aprovação." : "Nenhum recado aqui."}
        </p>
      ) : (
        <ul className="cards" aria-busy={loading}>
          {data?.messages.map((m) => (
            <li key={m.id} className="card message">
              <div className="card__head">
                <p>
                  <strong>{m.author}</strong>
                  {m.giftTitle && (
                    <span className="muted small"> · com o presente {m.giftTitle}</span>
                  )}
                </p>
                {m.approved ? (
                  <Badge tone="ok">Aprovado</Badge>
                ) : (
                  <Badge tone="warn">Aguardando</Badge>
                )}
              </div>
              <blockquote>{m.body}</blockquote>
              <div className="card__foot">
                <span className="muted small">{formatDateTime(m.createdAt)}</span>
                {m.approved ? (
                  <button
                    className="button button--small button--ghost"
                    onClick={() => setApproved(m, false)}
                  >
                    Ocultar
                  </button>
                ) : (
                  <button className="button button--small" onClick={() => setApproved(m, true)}>
                    Aprovar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
