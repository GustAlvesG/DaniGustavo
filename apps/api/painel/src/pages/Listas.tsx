import { GUEST_LIST_KINDS, type GuestList, type GuestListKind } from "@casamento/shared";
import { api } from "../api.ts";
import { formatDateTime } from "../format.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../ui.tsx";
import "../tools.css";
import { ea, eh } from "../nav.ts";

/* Listas dos confirmados para buffet, cerimonial e portaria: CSV ou impressão (PDF). */

const LABEL: Record<GuestListKind, string> = {
  buffet: "Buffet",
  cerimonial: "Cerimonial",
  portaria: "Portaria",
};

export function Listas({ kind: raw }: { kind: string }) {
  const kind: GuestListKind = (GUEST_LIST_KINDS as readonly string[]).includes(raw)
    ? (raw as GuestListKind)
    : "buffet";
  const { data, error, loading, reload } = useLoad(
    () => api<{ list: GuestList }>(`/invitations/lists/${kind}`),
    [kind],
  );
  const list = data?.list;
  const checkCol = list ? list.columns.indexOf("Chegou") : -1;

  return (
    <div className="stack stack--lg list-page">
      <div className="no-print stack stack--lg">
        <a className="back" href={eh("/convites")}>
          ← Convites
        </a>
        <PageHeader
          title="Listas e exportações"
          subtitle="Só pessoas confirmadas. Baixe a planilha (abre no Excel) ou imprima/salve em PDF."
          actions={
            <>
              <a
                className="button button--ghost"
                href={ea(`/invitations/lists/${kind}.csv`)}
                download
              >
                Baixar CSV
              </a>
              <button className="button" onClick={() => window.print()} disabled={!list}>
                Imprimir ou salvar PDF
              </button>
            </>
          }
        />
        <nav className="tabs" aria-label="Listas">
          {GUEST_LIST_KINDS.map((k) => (
            <a
              key={k}
              className="tab"
              href={eh(`/convites/listas/${k}`)}
              aria-current={k === kind ? "page" : undefined}
            >
              {LABEL[k]}
            </a>
          ))}
        </nav>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !list ? (
        <Loading />
      ) : list ? (
        <section className="card stack print-sheet" aria-labelledby="lista-titulo">
          <header className="print-head">
            <h2 id="lista-titulo">{list.title}</h2>
            <p className="muted small">
              {list.note} Gerada em {formatDateTime(list.generatedAt)}.
            </p>
          </header>
          <dl className="tally">
            {list.summary.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
          {list.rows.length === 0 ? (
            <p className="empty">Ninguém confirmou ainda.</p>
          ) : (
            <div className="table-wrap">
              <table className="table table--list">
                <thead>
                  <tr>
                    {list.columns.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) =>
                        j === checkCol ? (
                          <td key={j} className="check-cell">
                            <span className="box" aria-label="Chegou?" />
                          </td>
                        ) : (
                          <td key={j}>
                            {list.columns[j] === "Restrição alimentar" && cell ? (
                              <strong>{cell}</strong>
                            ) : (
                              cell
                            )}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
