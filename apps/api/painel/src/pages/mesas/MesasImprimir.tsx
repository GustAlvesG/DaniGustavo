import type { SeatingView } from "@casamento/shared";
import { useState } from "react";
import { api } from "../../api.ts";
import { useEvent } from "../../event.tsx";
import { eh } from "../../nav.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../../ui.tsx";
import "./mesas.css";

/* Impressão do mapa de mesas (#/mesas/imprimir): uma folha A4 por mesa ou plaquinhas. */

type Mode = "folhas" | "plaquinhas";

export function MesasImprimir() {
  const ev = useEvent();
  const [mode, setMode] = useState<Mode>("folhas");
  const { data, error, loading, reload } = useLoad(() => api<SeatingView>("/seating"), []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Sem dados."} onRetry={reload} />;

  const tables = data.tables.filter((t) => t.guests.length > 0);
  const sideLabel = (key: string | null) =>
    key ? (data.sides.find((s) => s.key === key)?.label ?? key) : null;

  return (
    <div className="stack stack--lg mesas-print">
      <div className="no-print stack stack--lg">
        <a className="back" href={eh("/mesas")}>
          ← Mesas
        </a>
        <PageHeader
          title="Imprimir mesas"
          subtitle="Folhas por mesa para o cerimonial e plaquinhas para dobrar e pôr nas mesas. Use “Salvar como PDF” se preferir."
          actions={
            <>
              <a className="button button--ghost" href={eh("/convites/listas/cerimonial")}>
                Lista do cerimonial (com mesa)
              </a>
              <button className="button" onClick={() => window.print()} disabled={!tables.length}>
                Imprimir ou salvar PDF
              </button>
            </>
          }
        />
        <div className="tabs" role="tablist" aria-label="Modelo de impressão">
          <button
            className="tab"
            role="tab"
            aria-selected={mode === "folhas"}
            onClick={() => setMode("folhas")}
          >
            Folha por mesa
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={mode === "plaquinhas"}
            onClick={() => setMode("plaquinhas")}
          >
            Plaquinhas
          </button>
        </div>
      </div>

      {tables.length === 0 ? (
        <p className="empty">Nenhuma mesa com pessoas ainda. Distribua os convidados primeiro.</p>
      ) : mode === "folhas" ? (
        tables.map((t) => (
          <section key={t.id} className="mesas-sheet card">
            <header>
              <p className="muted small">{ev.name}</p>
              <h2>{t.name}</h2>
              <p className="muted">
                {[sideLabel(t.side), t.groupLabel, `${t.guests.length} de ${t.seats} lugares`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {t.notes && <p className="muted small">{t.notes}</p>}
            </header>
            <ol className="mesas-sheet__list">
              {t.guests.map((g) => (
                <li key={g.guestId}>
                  <span>
                    {g.name}
                    {g.isChild ? " (criança)" : ""}
                    {g.rsvpStatus !== "confirmed" ? " (não confirmou)" : ""}
                  </span>
                  <span className="muted small">{g.seat !== null ? `lugar ${g.seat}` : ""}</span>
                </li>
              ))}
            </ol>
          </section>
        ))
      ) : (
        <div className="mesas-cards">
          {tables.flatMap((t) =>
            t.guests.map((g) => (
              <div key={g.guestId} className="mesas-card">
                <span className="mesas-card__name">{g.name}</span>
                <span className="mesas-card__table">{t.name}</span>
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}
