import { qrSvg, type AdminInvitation } from "@casamento/shared";
import { useMemo, useState } from "react";
import { api } from "../api.ts";
import { formatDate, plural } from "../format.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../ui.tsx";
import "../tools.css";
import { monogramOf, useEvent } from "../event.tsx";
import { eh } from "../nav.ts";

/*
 * QR dos convites em lote para imprimir (Salvar como PDF no navegador): A4, 8 cartões por
 * folha, no visual do convite (monograma, nomes, data, QR do link /c/token e o link em texto).
 */

const PER_SHEET = 8;
type Mode = "todos" | "nao-enviados" | "escolher";

/** GET /invitations/card: o cabeçalho do cartão (liberado com `invitations.read`). */
interface CardData {
  names: string | null;
  monogram: string | null;
  datetime: string | null;
}

/** Link sem "https://" e sem "www.", para caber no cartão. */
export const shortLink = (link: string) => link.replace(/^https?:\/\/(www\.)?/, "");

export function QrCard({
  inv,
  couple,
  date,
}: {
  inv: Pick<AdminInvitation, "label" | "link">;
  couple: { names: string; monogram: string };
  date: string | null;
}) {
  const svg = useMemo(
    () => qrSvg(inv.link, { dark: "#14213d", margin: 2, title: `QR do convite ${inv.label}` }),
    [inv.link, inv.label],
  );
  return (
    <article className="qr-card">
      <div className="qr-card__text">
        <span className="qr-card__mono" aria-hidden="true">
          {couple.monogram}
        </span>
        <p className="qr-card__names">{couple.names}</p>
        {date && <p className="qr-card__date">{date}</p>}
        <p className="qr-card__label">{inv.label}</p>
        <p className="qr-card__cta">Aponte a câmera do celular para confirmar a presença</p>
        <p className="qr-card__link">{shortLink(inv.link)}</p>
      </div>
      <div className="qr-card__qr" dangerouslySetInnerHTML={{ __html: svg }} />
    </article>
  );
}

export function ConvitesQr({ query }: { query: string }) {
  const params = new URLSearchParams(query);
  const initialIds = (params.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const [mode, setMode] = useState<Mode>(
    initialIds.length
      ? "escolher"
      : params.get("filtro") === "nao-enviados"
        ? "nao-enviados"
        : "todos",
  );
  const event = useEvent();
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(initialIds));
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ invitations: AdminInvitation[] }>("/invitations"),
        api<CardData>("/invitations/card"),
      ]),
    [],
  );

  if (loading && !data) return <Loading />;
  if (error || !data)
    return <ErrorBox message={error ?? "Não deu para carregar."} onRetry={reload} />;
  const [{ invitations }, card] = data;
  const couple = {
    names: card.names || event.name,
    monogram: card.monogram || monogramOf(event.name),
  };
  const date = card.datetime ? formatDate(card.datetime) : null;

  const selected = invitations.filter((i) =>
    mode === "todos" ? true : mode === "nao-enviados" ? !i.sentAt : chosen.has(i.id),
  );
  const sheets: AdminInvitation[][] = [];
  for (let i = 0; i < selected.length; i += PER_SHEET) {
    sheets.push(selected.slice(i, i + PER_SHEET));
  }
  const toggle = (id: number) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="stack stack--lg qr-page">
      <div className="no-print stack stack--lg">
        <a className="back" href={eh("/convites")}>
          ← Convites
        </a>
        <PageHeader
          title="QR dos convites"
          subtitle={`${plural(selected.length, "cartão", "cartões")} · ${plural(sheets.length, "folha", "folhas")} A4 (${PER_SHEET} por folha).`}
          actions={
            <button
              className="button"
              disabled={selected.length === 0}
              onClick={() => window.print()}
            >
              Imprimir ou salvar PDF
            </button>
          }
        />
        <section className="card stack" aria-labelledby="qr-quais">
          <h2 id="qr-quais">Quais convites</h2>
          <div className="segmented" role="radiogroup" aria-label="Quais convites">
            {(
              [
                ["todos", `Todos (${invitations.length})`],
                ["nao-enviados", `Não enviados (${invitations.filter((i) => !i.sentAt).length})`],
                ["escolher", "Escolher"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="check">
                <input
                  type="radio"
                  name="qr-modo"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {mode === "escolher" && (
            <fieldset className="qr-choose">
              <legend className="sr-only">Convites para imprimir</legend>
              <div className="actions actions--tight">
                <button
                  className="button button--ghost button--small"
                  onClick={() => setChosen(new Set(invitations.map((i) => i.id)))}
                >
                  Marcar todos
                </button>
                <button
                  className="button button--ghost button--small"
                  onClick={() => setChosen(new Set())}
                >
                  Desmarcar todos
                </button>
              </div>
              {invitations.map((i) => (
                <label key={i.id} className="check">
                  <input type="checkbox" checked={chosen.has(i.id)} onChange={() => toggle(i.id)} />
                  {i.label}
                  {!i.sentAt && <span className="muted small"> · não enviado</span>}
                </label>
              ))}
            </fieldset>
          )}
          <p className="muted small">
            Na janela de impressão escolha <strong>Salvar como PDF</strong> (ou a impressora), papel
            A4, margens padrão e escala 100%. Imprimir não marca o convite como enviado.
          </p>
        </section>
      </div>

      {selected.length === 0 ? (
        <p className="empty no-print">Nenhum convite selecionado.</p>
      ) : (
        <div className="qr-sheets" aria-label="Prévia da impressão">
          {sheets.map((sheet, n) => (
            <section key={n} className="qr-sheet" aria-label={`Folha ${n + 1}`}>
              {sheet.map((inv) => (
                <QrCard key={inv.id} inv={inv} couple={couple} date={date} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
