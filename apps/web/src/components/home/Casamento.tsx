import type { SiteContent } from "@casamento/shared";
import { Cabecalho, FotoImg } from "@/components/album";
import { ButtonLink, buttonStyles } from "@/components/ui";
import type { HomeContent } from "@/content/home";
import { googleCalendarUrl } from "@/lib/calendar";
import { cx } from "@/lib/cx";
import {
  formatHour,
  formatLongDate,
  hasAddress,
  mapsLink,
  venueBlocks,
  weddingEvent,
  type CalendarSource,
  weddingHeadline,
} from "@/lib/site";
import styles from "./home.module.css";

/**
 * O casamento: foto numa moldura de papel com cantoneiras e, ao lado,
 * cartões de fio duplo com quando, onde e onde ficar. Tudo do banco
 * (/api/site), menos a foto, a legenda e a frase de apoio (content/home.ts).
 */
export function Casamento({
  home,
  site,
  agenda,
  pagina,
}: {
  home: HomeContent;
  site: SiteContent;
  /** De qual evento é a agenda (UID, título e link do site). */
  agenda: CalendarSource;
  pagina?: number;
}) {
  const { casamento } = home;
  const tz = site.wedding.timezone;
  const start = site.wedding.datetime;
  const ceremonyTime = site.ceremony.time || formatHour(start, tz);
  const times = [
    `Cerimônia às ${ceremonyTime}`,
    site.reception.time ? `recepção às ${site.reception.time}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const arrival = site.schedule[0]?.time;
  const longDate = formatLongDate(start, tz);

  return (
    <section
      className={cx(styles.sec, "surface-areia")}
      id="casamento"
      aria-labelledby="casamento-titulo"
    >
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="casamento-titulo"
          pagina={pagina}
          rotulo={casamento.rotulo}
          titulo={weddingHeadline(start, tz)}
          lead={casamento.lead}
        />
        <div className={styles.casamentoGrid}>
          {casamento.foto ? (
            <figure className="moldura-papel r1 assenta">
              <span className="canto a" />
              <span className="canto b" />
              <span className="canto c" />
              <span className="canto d" />
              <div className={styles.fotoPaisagem}>
                <FotoImg foto={casamento.foto} sizes="(max-width: 860px) 92vw, 560px" fill />
              </div>
              <figcaption>{casamento.legendaFoto}</figcaption>
            </figure>
          ) : null}

          <div className={styles.pilha}>
            <article className={cx("cartao de-dir", styles.cartao)} aria-labelledby="quando">
              <IconCalendar />
              <div className="rotulo">Quando</div>
              <h3 id="quando" className="first-letter:uppercase">
                {longDate}
              </h3>
              <p className={styles.forte}>{times}</p>
              {arrival && arrival !== ceremonyTime ? <p>Chegue a partir das {arrival}.</p> : null}
              <div className={styles.acoes}>
                {/* Link comum para a rota do .ics: o navegador baixa o arquivo. */}
                <a href="/agenda.ics" download="casamento.ics" className={buttonStyles()}>
                  Adicionar à agenda
                </a>
                <a
                  href={googleCalendarUrl(weddingEvent(site, agenda), tz)}
                  target="_blank"
                  rel="noopener"
                  className={buttonStyles({ variant: "secondary" })}
                >
                  Adicionar ao Google Agenda
                </a>
              </div>
            </article>

            {venueBlocks(site).map((block, i) => (
              <article
                key={block.key}
                className={cx("cartao", i % 2 ? "de-dir" : "de-esq", styles.cartao)}
                aria-labelledby={`local-${block.key}`}
              >
                <IconPin />
                <div className="rotulo">
                  {block.key === "local" ? "Onde" : `Onde · ${block.title}`}
                </div>
                <h3 id={`local-${block.key}`}>{block.venue.name}</h3>
                <address className={styles.endereco}>
                  <p className={styles.forte}>
                    {hasAddress(block.venue)
                      ? block.venue.address
                      : "O endereço sai assim que o local for definido."}
                  </p>
                </address>
                {i === 0 && site.accommodation.howToGetThere ? (
                  <p>{site.accommodation.howToGetThere}</p>
                ) : null}
                <div className={styles.acoes}>
                  <ButtonLink href={mapsLink(block.venue)} target="_blank" rel="noopener">
                    {block.venue.mapsUrl ? "Abrir no Google Maps" : "Como chegar"}
                    <IconArrow />
                  </ButtonLink>
                  {block.venue.wazeUrl ? (
                    <ButtonLink
                      href={block.venue.wazeUrl}
                      target="_blank"
                      rel="noopener"
                      variant="secondary"
                    >
                      Abrir no Waze
                    </ButtonLink>
                  ) : null}
                </div>
              </article>
            ))}

            {site.accommodation.items.length ? (
              <article
                className={cx("cartao de-dir", styles.cartao)}
                id="hospedagem"
                aria-labelledby="hospedagem-titulo"
              >
                <IconHouse />
                <div className="rotulo">Hospedagem</div>
                <h3 id="hospedagem-titulo">{casamento.tituloHospedagem}</h3>
                <ul className={styles.hosp}>
                  {site.accommodation.items.map((item) => (
                    <li key={item.name}>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener">
                          <b>{item.name}</b>
                        </a>
                      ) : (
                        <b>{item.name}</b>
                      )}{" "}
                      · {item.distance}.{item.note ? ` ${item.note}` : ""}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

const icon = {
  className: styles.icone,
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  "aria-hidden": true,
} as const;

function IconCalendar() {
  return (
    <svg {...icon}>
      <rect x="4" y="7" width="24" height="21" rx="2" />
      <path d="M4 13h24M10 4v6M22 4v6" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg {...icon}>
      <path d="M16 29s9-8.4 9-15a9 9 0 0 0-18 0c0 6.6 9 15 9 15z" />
      <circle cx="16" cy="14" r="3.2" />
    </svg>
  );
}

function IconHouse() {
  return (
    <svg {...icon}>
      <path d="M4 26V12l12-7 12 7v14" />
      <path d="M12 26v-8h8v8M2 26h28" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M3 13L13 3M6 3h7v7" />
    </svg>
  );
}
