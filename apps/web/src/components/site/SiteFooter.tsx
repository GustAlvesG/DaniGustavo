import type { SiteContent } from "@casamento/shared";
import { Seal } from "@/components/brand";
import { TileBand } from "@/components/tiles";
import { ButtonLink } from "@/components/ui";
import { formatWeddingDate } from "@/lib/countdown";
import { formatDayMonth, whatsappUrl } from "@/lib/site";
import { NavLinks } from "./NavLinks";

const link =
  "inline-flex min-h-11 items-center rounded-[2px] text-lg text-ink underline decoration-accent decoration-1 underline-offset-[0.3em] transition-[text-decoration-thickness] duration-micro ease-out hover:decoration-2";

/**
 * Rodapé em royal (a moldura grossa dos cartões do casal): o fecho da
 * página. Contato dos noivos, prazo do RSVP, o selo e o menu.
 */
export function SiteFooter({ site }: { site: SiteContent }) {
  const wa = whatsappUrl(site.contact.whatsapp, "Oi, Dani e Gustavo!");
  const email = site.contact.email.trim();
  return (
    <footer className="surface-royal" id="contato">
      <TileBand design="moldura" />
      <div className="page-wrap page-grid gap-y-14 pt-16 pb-10 lg:pt-24 lg:pb-12">
        <div className="lg:col-span-6">
          <h2 className="font-display text-display-sm text-ink">{site.contact.message}</h2>
          <ul className="mt-8 flex flex-col gap-1">
            {wa ? (
              <li>
                <a href={wa} className={link} rel="noopener" target="_blank">
                  Mandar mensagem no WhatsApp
                </a>
              </li>
            ) : null}
            {email ? (
              <li>
                <a href={`mailto:${email}`} className={link}>
                  {email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>

        {/* Some nas páginas de RSVP (main[data-rsvp]): lá o formulário já é a ação. */}
        <div className="flex flex-col items-start gap-6 lg:col-span-5 lg:col-start-8 [body:has(main[data-rsvp])_&]:hidden">
          <p className="max-w-[30ch] text-lg text-ink-soft">
            Confirme sua presença até {formatDayMonth(site.rsvp.deadline)}. Leva um minuto.
          </p>
          <ButtonLink href="/confirmar" size="lg" variant="primary">
            Confirmar presença
          </ButtonLink>
        </div>

        <div className="flex flex-col gap-10 border-t border-line-soft pt-10 lg:col-span-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-6">
            <Seal
              tone="relevo"
              size="6.5rem"
              date={site.wedding.datetime}
              timeZone={site.wedding.timezone}
            />
            <p className="text-base text-ink-soft">
              {site.couple.names}
              <br />
              {formatWeddingDate(site.wedding.datetime, site.wedding.timezone)}
            </p>
          </div>
          <nav aria-label="Rodapé">
            <NavLinks />
          </nav>
        </div>
      </div>
    </footer>
  );
}
