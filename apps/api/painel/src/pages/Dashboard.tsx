import type { DashboardData } from "@casamento/shared";
import { api } from "../api.ts";
import { daysUntil, formatBRL, formatDate, formatDateTime, plural } from "../format.ts";
import { ErrorBox, Loading, PageHeader, useLoad } from "../ui.tsx";

const AGE_LABEL = { "0-2": "0 a 2 anos", "3-7": "3 a 7 anos", "8-12": "8 a 12 anos" } as const;

function StatusRow({
  counts,
  unit,
}: {
  counts: { confirmed: number; pending: number; declined: number; total: number };
  unit: [string, string];
}) {
  const pct = (n: number) => (counts.total ? (n / counts.total) * 100 : 0);
  return (
    <>
      <div className="meter" aria-hidden="true">
        <span className="meter__ok" style={{ width: `${pct(counts.confirmed)}%` }} />
        <span className="meter__warn" style={{ width: `${pct(counts.pending)}%` }} />
        <span className="meter__muted" style={{ width: `${pct(counts.declined)}%` }} />
      </div>
      <dl className="tally">
        <div>
          <dt>Confirmados</dt>
          <dd>{counts.confirmed}</dd>
        </div>
        <div>
          <dt>Pendentes</dt>
          <dd>{counts.pending}</dd>
        </div>
        <div>
          <dt>Não vão</dt>
          <dd>{counts.declined}</dd>
        </div>
      </dl>
      <p className="muted small">Total: {plural(counts.total, unit[0], unit[1])}</p>
    </>
  );
}

export function Dashboard() {
  const { data, error, loading, reload } = useLoad(() => api<DashboardData>("/dashboard"), []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Sem dados."} onRetry={reload} />;

  const days = data.rsvpDeadline ? daysUntil(data.rsvpDeadline) : null;
  const { attending, money } = data;

  return (
    <div className="stack stack--lg">
      <PageHeader title="Início" subtitle="Resumo das confirmações e dos presentes." />

      <div className="grid grid--3">
        <section className="card" aria-labelledby="d-conv">
          <h2 id="d-conv">Convites</h2>
          <StatusRow counts={data.invitations} unit={["convite", "convites"]} />
        </section>
        <section className="card" aria-labelledby="d-pess">
          <h2 id="d-pess">Pessoas</h2>
          <StatusRow counts={data.guests} unit={["pessoa", "pessoas"]} />
        </section>
        <section className="card" aria-labelledby="d-prazo">
          <h2 id="d-prazo">Prazo do RSVP</h2>
          <p className="big">{formatDate(data.rsvpDeadline)}</p>
          <p className="muted">
            {days === null
              ? "Defina o prazo em Configurações."
              : days > 0
                ? `Faltam ${plural(days, "dia", "dias")}.`
                : "O prazo já passou: o site não aceita mais respostas."}
          </p>
          <a className="link-small" href="#/configuracoes">
            Alterar prazo
          </a>
        </section>
      </div>

      <div className="grid grid--2">
        <section className="card" aria-labelledby="d-vem">
          <h2 id="d-vem">Quem vem (confirmados)</h2>
          <dl className="tally">
            <div>
              <dt>Adultos</dt>
              <dd>{attending.adults}</dd>
            </div>
            <div>
              <dt>Crianças</dt>
              <dd>{attending.children}</dd>
            </div>
          </dl>
          {attending.children > 0 && (
            <ul className="plain small">
              {(Object.keys(AGE_LABEL) as (keyof typeof AGE_LABEL)[]).map((k) => (
                <li key={k}>
                  {AGE_LABEL[k]}: <strong>{attending.childrenByAge[k]}</strong>
                </li>
              ))}
              {attending.childrenByAge["sem-faixa"] > 0 && (
                <li>
                  Sem faixa informada: <strong>{attending.childrenByAge["sem-faixa"]}</strong>
                </li>
              )}
            </ul>
          )}
          <a className="link-small" href="/api/admin/invitations/lists/buffet.csv" download>
            Baixar lista do buffet (CSV)
          </a>{" "}
          ·{" "}
          <a className="link-small" href="#/convites/listas/buffet">
            Outras listas
          </a>
        </section>
        <section className="card" aria-labelledby="d-din">
          <h2 id="d-din">Arrecadado</h2>
          <dl className="tally">
            <div>
              <dt>Bruto</dt>
              <dd>{formatBRL(money.grossCents)}</dd>
            </div>
            <div>
              <dt>Líquido estimado</dt>
              <dd>{formatBRL(money.netCents)}</dd>
            </div>
          </dl>
          <p className="muted small">
            {plural(money.paidOrders, "presente pago", "presentes pagos")}
            {money.pendingOrders > 0 &&
              ` · ${plural(money.pendingOrders, "aguardando pagamento", "aguardando pagamento")}`}
            . Líquido desconta {String(money.cardFeePercent).replace(".", ",")}% dos pagamentos com
            cartão.
          </p>
        </section>
      </div>

      <section className="card" aria-labelledby="d-ult">
        <div className="card__head">
          <h2 id="d-ult">Últimos presentes</h2>
          <a className="link-small" href="#/pedidos">
            Ver todos os pedidos
          </a>
        </div>
        {data.recentGifts.length === 0 ? (
          <p className="muted">Nenhum presente pago ainda.</p>
        ) : (
          <ul className="feed">
            {data.recentGifts.map((g) => (
              <li key={g.publicId}>
                <p>
                  <strong>{g.buyerName}</strong> deu <strong>{g.giftTitle}</strong> ·{" "}
                  {formatBRL(g.totalCents)}
                </p>
                {g.message && <blockquote>“{g.message}”</blockquote>}
                <p className="muted small">{formatDateTime(g.paidAt)}</p>
              </li>
            ))}
          </ul>
        )}
        {data.pendingMessages > 0 && (
          <p className="alert alert--info">
            {plural(data.pendingMessages, "recado aguarda", "recados aguardam")} sua aprovação.{" "}
            <a href="#/recados">Moderar recados</a>
          </p>
        )}
      </section>
    </div>
  );
}
