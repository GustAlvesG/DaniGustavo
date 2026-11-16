import type { SiteContent, Venue } from "@casamento/shared";
import { TileGrid } from "@/components/tiles";
import { ButtonLink, SectionHeading, buttonStyles } from "@/components/ui";
import { googleCalendarUrl } from "@/lib/calendar";
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
      <div className="lg:col-span-7">
        <SectionHeading id="casamento-titulo">O casamento</SectionHeading>
        <p className="mt-8 font-display text-display-sm text-tinta first-letter:uppercase">
          {formatLongDate(site.wedding.datetime, tz)}, às {formatHour(site.wedding.datetime, tz)}
        </p>
      </div>

      {venueBlocks(site).map((block) => (
        <article
          key={block.key}
          className="grid gap-8 lg:col-span-12 lg:grid-cols-12 lg:gap-x-[var(--grid-gap)]"
          aria-labelledby={`local-${block.key}`}
        >
          <div className="flex flex-col gap-4 lg:col-span-5">
            <h3 id={`local-${block.key}`} className="text-lg font-medium text-tinta/80">
              {block.title}
            </h3>
            <p className="font-display text-3xl text-tinta">{block.venue.name}</p>
            <p className="max-w-[40ch] text-base text-tinta/80">
              {hasAddress(block.venue)
                ? block.venue.address
                : "O endereço sai assim que o local for definido."}
            </p>
            {block.venue.time ? <p className="text-base text-tinta">{block.venue.time}</p> : null}
            <VenueLinks venue={block.venue} />
          </div>
          <div className="lg:col-span-6 lg:col-start-7">
            <VenueMap venue={block.venue} />
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
    <div className="mt-2 flex flex-wrap gap-3">
      {venue.mapsUrl ? (
        <ButtonLink href={venue.mapsUrl} target="_blank" rel="noopener" variant="secondary">
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
 * tela, `loading="lazy"`); sem coordenadas, um painel de azulejos em névoa.
 */
function VenueMap({ venue }: { venue: Venue }) {
  if (hasCoords(venue)) {
    return (
      <iframe
        src={osmEmbedUrl(venue.lat, venue.lng)}
        title={`Mapa: ${venue.name}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="block aspect-[4/3] w-full border border-nevoa bg-nevoa"
      />
    );
  }
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden" data-map-placeholder="">
      <TileGrid design="trama" cols={4} rows={3} face="nevoa" className="opacity-70" />
      <div className="absolute bottom-0 left-0 m-4 max-w-[26ch] border border-cobalto/30 bg-branco px-5 py-4 lg:m-6">
        <p className="text-base font-medium text-tinta">Mapa em breve</p>
        <p className="mt-1 text-sm text-tinta/75">Aparece aqui assim que o local for definido.</p>
      </div>
    </div>
  );
}
