import type { SiteContent, Venue } from "@casamento/shared";
import { Seal } from "@/components/brand";
import { TileGrid } from "@/components/tiles";
import { ButtonLink, SectionHeading, buttonStyles } from "@/components/ui";
import { googleCalendarUrl } from "@/lib/calendar";
import { cx } from "@/lib/cx";
import {
  formatHour,
  formatLongDate,
  hasAddress,
  hasCoords,
  osmEmbedUrl,
  venueBlocks,
  weddingEvent,
} from "@/lib/site";
import { Section } from "./Section";

/** O casamento: data, cerimônia e recepção, mapa, rotas e "adicionar à agenda". */
export function Wedding({ site }: { site: SiteContent }) {
  const tz = site.wedding.timezone;
  const event = weddingEvent(site);
  return (
    <Section id="casamento" band="estrela">
      <div className="lg:col-span-8">
        <SectionHeading id="casamento-titulo">O casamento</SectionHeading>
        <p className="mt-8 font-display text-display-sm text-ink first-letter:uppercase">
          {formatLongDate(site.wedding.datetime, tz)}, às {formatHour(site.wedding.datetime, tz)}
        </p>
      </div>

      {venueBlocks(site).map((block, i) => (
        <article
          key={block.key}
          className="grid gap-10 lg:col-span-12 lg:grid-cols-12 lg:items-center lg:gap-x-[var(--grid-gap)]"
          aria-labelledby={`local-${block.key}`}
        >
          {/* O cartão do manual: arco claro com moldura royal, texto ao centro. */}
          <div
            className={cx(
              "surface-relevo card-relevo shape-arch flex flex-col items-center gap-3 px-6 pt-[clamp(5.5rem,22vw,8rem)] pb-10 text-center sm:px-10 lg:col-span-5",
              "[--arch-rise:clamp(8rem,32vw,13rem)] [--arch-foot:2rem]",
              i % 2 === 1 && "lg:order-2 lg:col-start-8",
            )}
          >
            <h3 id={`local-${block.key}`} className="text-base font-medium text-ink-soft">
              {block.title}
            </h3>
            <p className="font-display text-display-sm text-ink">{block.venue.name}</p>
            <p className="max-w-[32ch] text-base text-ink-soft">
              {hasAddress(block.venue)
                ? block.venue.address
                : "O endereço sai assim que o local for definido."}
            </p>
            {block.venue.time ? (
              <p className="font-display text-3xl text-ink tabular-nums">{block.venue.time}</p>
            ) : null}
            <VenueLinks venue={block.venue} />
          </div>
          <div className={cx("lg:col-span-6", i % 2 === 1 ? "lg:col-start-1" : "lg:col-start-7")}>
            <VenueMap
              venue={block.venue}
              date={site.wedding.datetime}
              timeZone={tz}
              design={i % 2 ? "ramo" : "rosa"}
            />
          </div>
        </article>
      ))}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap lg:col-span-12">
        {/* Link comum para a rota do .ics: o navegador baixa o arquivo. */}
        <a href="/agenda.ics" download="casamento.ics" className={buttonStyles({ size: "lg" })}>
          Adicionar à agenda
        </a>
        <a
          href={googleCalendarUrl(event, tz)}
          target="_blank"
          rel="noopener"
          className={buttonStyles({ size: "lg", variant: "secondary" })}
        >
          Adicionar ao Google Agenda
        </a>
      </div>
    </Section>
  );
}

function VenueLinks({ venue }: { venue: Venue }) {
  if (!venue.mapsUrl && !venue.wazeUrl) return null;
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-3">
      {venue.mapsUrl ? (
        <ButtonLink href={venue.mapsUrl} target="_blank" rel="noopener" variant="primary">
          Abrir no Google Maps
        </ButtonLink>
      ) : null}
      {venue.wazeUrl ? (
        <ButtonLink href={venue.wazeUrl} target="_blank" rel="noopener" variant="secondary">
          Abrir no Waze
        </ButtonLink>
      ) : null}
    </div>
  );
}

/**
 * Mapa: com coordenadas, um iframe do OpenStreetMap (carregado só perto da
 * tela, `loading="lazy"`) numa cápsula. Sem coordenadas, um painel de
 * azulejos com o selo do casal (decorativo; as rotas estão nos botões).
 */
function VenueMap({
  venue,
  date,
  timeZone,
  design,
}: {
  venue: Venue;
  date: string;
  timeZone: string;
  design: "rosa" | "ramo";
}) {
  if (hasCoords(venue)) {
    return (
      <iframe
        src={osmEmbedUrl(venue.lat, venue.lng)}
        title={`Mapa: ${venue.name}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="block aspect-[4/3] w-full rounded-[2rem] border-[1.5px] border-line-soft bg-field"
      />
    );
  }
  return (
    <div
      className="relative mx-auto hidden aspect-square w-full max-w-[30rem] overflow-hidden rounded-full border-[1.5px] border-line-soft lg:block"
      data-map-placeholder=""
      aria-hidden="true"
    >
      <TileGrid design={design} cols={4} rows={4} />
      <div className="absolute inset-0 grid place-items-center">
        <Seal date={date} timeZone={timeZone} tone="relevo" size="9.5rem" />
      </div>
    </div>
  );
}
