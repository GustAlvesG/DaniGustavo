import type { SiteContent } from "@casamento/shared";
import { Monogram, TileBand } from "@/components/tiles";
import { ButtonLink } from "@/components/ui";
import { formatWeddingDate } from "@/lib/countdown";
import { formatDayMonth, whatsappUrl } from "@/lib/site";
import { NavLinks } from "./NavLinks";

const linkOnDark =
  "inline-flex min-h-11 items-center rounded-[1px] text-lg text-branco underline decoration-branco/50 decoration-1 underline-offset-[0.3em] transition-[text-decoration-color] duration-micro ease-out hover:decoration-branco";

/**
 * Rodapé em cobalto: o fecho da página, como a barra pintada que arremata um
 * painel de azulejos. Contato dos noivos, prazo do RSVP e o menu.
 */
export function SiteFooter({ site }: { site: SiteContent }) {
  const wa = whatsappUrl(site.contact.whatsapp, "Oi, Dani e Gustavo!");
  const email = site.contact.email.trim();
  return (
    <footer className="focus-on-dark bg-cobalto text-branco" id="contato">
      <TileBand design="moldura" />
      <div className="page-wrap page-grid gap-y-14 pt-16 pb-10 lg:pt-24 lg:pb-12">
        <div className="lg:col-span-6">
          <h2 className="font-display text-display-sm text-branco">{site.contact.message}</h2>
          <ul className="mt-8 flex flex-col gap-1">
            {wa ? (
              <li>
                <a href={wa} className={linkOnDark} rel="noopener" target="_blank">
                  Mandar mensagem no WhatsApp
                </a>
              </li>
            ) : null}
            {email ? (
              <li>
                <a href={`mailto:${email}`} className={linkOnDark}>
                  {email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="flex flex-col items-start gap-6 lg:col-span-5 lg:col-start-8">
          <p className="max-w-[30ch] text-lg text-branco/90">
            Confirme sua presença até {formatDayMonth(site.rsvp.deadline)}. Leva um minuto.
          </p>
          <ButtonLink
            href="/confirmar"
            size="lg"
            variant="secondary"
            className="border-branco text-branco not-disabled:hover:bg-branco not-disabled:hover:text-cobalto"
          >
            Confirmar presença
          </ButtonLink>
        </div>

        <div className="flex flex-col gap-10 border-t border-branco/25 pt-10 lg:col-span-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-end gap-5">
            <span className="block w-24 [--tile-ink:var(--color-branco)]">
              <Monogram weight={2} />
            </span>
            <p className="pb-1 text-base text-branco/85">
              {site.couple.names}
              <br />
              {formatWeddingDate(site.wedding.datetime, site.wedding.timezone)}
            </p>
          </div>
          <nav aria-label="Rodapé">
            <NavLinks tone="dark" />
          </nav>
        </div>
      </div>
    </footer>
  );
}
