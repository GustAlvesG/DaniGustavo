import Link from "next/link";
import type { SiteContent } from "@casamento/shared";
import { Monograma } from "@/components/brand";
import { ContactLinks } from "@/components/rsvp/ContactLinks";
import { ButtonLink } from "@/components/ui";
import { getMonogram } from "@/lib/api/site";
import {
  cityFromAddress,
  footerLinks,
  formatDayMonth,
  formatDotDate,
  moduleAvailable,
} from "@/lib/site";

const small =
  "font-sans text-[0.72rem] tracking-[0.24em] uppercase text-nevoa no-underline hover:underline underline-offset-[6px]";

/**
 * Rodapé marinho, o fecho do álbum: monograma, os nomes em Pinyon Script,
 * data e local, o contato dos anfitriões, o convite a confirmar presença e a
 * frase do rodapé. Sem revelações na rolagem aqui: no fim da página
 * não há rolagem suficiente para elas terminarem.
 */
export async function SiteFooter({ site }: { site: SiteContent }) {
  const iniciais = await getMonogram();
  const { phrase } = site.sections.footer;
  const links = footerLinks(site);
  const tz = site.wedding.timezone;
  const place = [site.ceremony.name, cityFromAddress(site.ceremony.address)]
    .filter(Boolean)
    .join(" · ");
  return (
    <footer className="surface-marinho px-4 pt-[90px] pb-10 text-center" id="contato">
      <Monograma
        iniciais={iniciais}
        className="mx-auto w-[120px]"
        bold={6}
        label={site.couple.names}
      />
      <p className="mt-[18px] mb-0 font-script text-[clamp(2.6rem,6vw,3.8rem)] leading-[1.1]">
        {site.couple.names}
      </p>
      <p className="mt-2.5 font-sans text-[0.72rem] tracking-[0.3em] text-nevoa uppercase">
        <span className="inline-block">{formatDotDate(site.wedding.datetime, tz)}</span> ·{" "}
        <span className="inline-block">{place}</span>
      </p>

      <div className="mx-auto mt-12 flex max-w-[520px] flex-col items-center gap-3">
        <p className="m-0 text-xl">{site.contact.message}</p>
        <ContactLinks contact={site.contact} />
      </div>

      {/* Some nas páginas de RSVP (main[data-rsvp]): lá o formulário já é a ação. */}
      {moduleAvailable(site, "rsvp") ? (
        <div className="mx-auto mt-8 flex max-w-[520px] flex-col items-center gap-5 [body:has(main[data-rsvp])_&]:hidden">
          <p className="m-0 text-ink-soft">
            Confirme sua presença até {formatDayMonth(site.rsvp.deadline, tz)}. Leva um minuto.
          </p>
          <ButtonLink href="/confirmar" variant="secondary">
            Confirmar presença
          </ButtonLink>
        </div>
      ) : null}

      {phrase ? (
        <p className="mx-auto mt-10 max-w-[520px] text-[#e1e8f5] italic">{phrase}</p>
      ) : null}

      <nav aria-label="Rodapé" className="mt-8">
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-1">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={`inline-flex min-h-11 items-center ${small}`}>
                {l.label}
              </Link>
            </li>
          ))}
          {/* Fase 6 (LGPD): o aviso de privacidade e o pedido do titular. */}
          <li>
            <Link href="/privacidade" className={`inline-flex min-h-11 items-center ${small}`}>
              Privacidade
            </Link>
          </li>
          <li>
            <a href="#" className={`inline-flex min-h-11 items-center ${small}`}>
              Voltar ao topo
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
