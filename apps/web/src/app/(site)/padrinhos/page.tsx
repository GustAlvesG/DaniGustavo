import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LineIcon, MonogramDG, iconForText } from "@/components/brand";
import { Swatches } from "@/components/home/Swatches";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TileBand } from "@/components/tiles";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { getSite } from "@/lib/api/site";
import { cx } from "@/lib/cx";
import { formatHour, monthGrid } from "@/lib/site";

export const metadata: Metadata = {
  title: "Manual dos padrinhos",
  description: "Traje, horários, missões e recados para madrinhas e padrinhos.",
};

const h2 = "font-display text-display-sm text-ink";
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;
const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Seção do manual: título à esquerda (ou no topo) e conteúdo livre. */
function Block({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("section-space", className)} aria-labelledby={id}>
      <div className="page-wrap page-grid gap-y-12">
        <h2 id={id} className={cx(h2, "lg:col-span-12")}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

/**
 * Manual dos padrinhos (docs/marca/manual-padrinhos.pdf), na linguagem do
 * manual do casal: arcos claros com moldura royal (madrinhas, padrinhos, a
 * data), uma cápsula (músicas e fotos), o arco marinho (para o grande dia) e
 * o versículo num selo no fim. Todo o texto vem de /api/site.
 */
export default async function GodparentsPage() {
  const site = await getSite();
  const g = site.godparents;
  const tz = site.wedding.timezone;
  const cal = monthGrid(site.wedding.datetime, tz);
  const hour = formatHour(site.wedding.datetime, tz);
  const showPalette = g.palette.length > 1 || !g.bridesmaids;

  return (
    <PageTransition>
      <SiteHeader band="rosa" />
      <main id="conteudo" className="flex-1">
        {/* Convite */}
        <section className="section-space" aria-labelledby="padrinhos-titulo">
          <div className="page-wrap page-grid items-center gap-y-14">
            <div className="lg:col-span-7">
              <SectionHeading as="h1" id="padrinhos-titulo">
                Manual dos padrinhos
              </SectionHeading>
              <p className="mt-8 max-w-[52ch] text-xl text-ink-soft">
                {g.invitation ??
                  "Obrigado por estar do nosso lado no altar. Aqui está o que combinar antes do dia."}
              </p>
            </div>
            {/* A capa do manual: arco marinho com o DG na vertical. */}
            <div
              aria-hidden="true"
              className="card-marinho shape-arch mx-auto grid aspect-[3/4] w-[min(70%,17rem)] place-items-center [--arch-rise:37.5%] lg:col-span-4 lg:col-start-9"
            >
              <MonogramDG vertical bold={6} className="w-[58%] text-ink" />
            </div>
          </div>
        </section>

        <TileBand design="rosa" />

        {/* Traje: os dois cartões do manual lado a lado. */}
        <Block id="padrinhos-traje" title="O traje">
          <p className="max-w-[46ch] text-xl text-ink lg:col-span-8">{g.dressCode}</p>
          <div className="grid gap-12 sm:grid-cols-2 sm:gap-8 lg:col-span-10 lg:gap-12">
            {g.bridesmaids ? (
              <article
                aria-labelledby="madrinhas"
                className="surface-relevo card-relevo shape-arch flex flex-col items-center gap-5 px-7 pt-[clamp(4.5rem,18vw,7rem)] pb-10 text-center [--arch-rise:clamp(7rem,30vw,11rem)] sm:px-9"
              >
                <h3 id="madrinhas" className="font-display text-3xl text-ink">
                  Madrinhas
                </h3>
                <p className="max-w-[34ch] text-base text-ink-soft">{g.bridesmaids.text}</p>
                <div className="mt-2 flex flex-col items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="block size-16 rounded-full outline-1 outline-offset-4 outline-line-soft"
                    style={{ backgroundColor: g.bridesmaids.inspiration.hex }}
                  />
                  <p className="text-sm text-ink-soft">Inspiração</p>
                  <p className="font-display text-2xl text-ink">{g.bridesmaids.inspiration.name}</p>
                </div>
              </article>
            ) : null}
            {g.groomsmen ? (
              <article
                aria-labelledby="padrinhos-cartao"
                className="surface-relevo card-relevo shape-arch flex flex-col items-center gap-5 px-7 pt-[clamp(4.5rem,18vw,7rem)] pb-10 text-center [--arch-rise:clamp(7rem,30vw,11rem)] sm:px-9"
              >
                <h3 id="padrinhos-cartao" className="font-display text-3xl text-ink">
                  Padrinhos
                </h3>
                <p className="max-w-[34ch] text-base text-ink-soft">{g.groomsmen.text}</p>
                <p className="mt-2 max-w-[24ch] font-display text-2xl text-ink">
                  {g.groomsmen.summary}
                </p>
              </article>
            ) : null}
          </div>
          {showPalette && g.palette.length ? (
            <div className="lg:col-span-8">
              <h3 className="mb-6 text-lg font-medium text-ink">Paleta</h3>
              <Swatches colors={g.palette} label="Paleta dos padrinhos" />
            </div>
          ) : null}
        </Block>

        {/* Data e horários */}
        <div className="surface-relevo">
          <TileBand design="estrela" />
          <Block id="padrinhos-horarios" title="Guarde a data">
            <div className="lg:col-span-5">
              <p className="flex items-end gap-5 text-ink">
                <span className="font-display text-display-lg leading-[0.8] tabular-nums">
                  {cal.day}
                </span>
                <span className="pb-1 text-xl leading-tight">
                  {cal.month} de {cal.year}
                  <br />
                  <span className="text-ink-soft">às {hour}</span>
                </span>
              </p>
              <table className="mt-10 w-full max-w-[22rem] table-fixed border-collapse text-center tabular-nums">
                <caption className="sr-only">
                  Calendário de {cal.month} de {cal.year}, com o dia {cal.day} marcado
                </caption>
                <thead>
                  <tr>
                    {WEEKDAYS.map((d, i) => (
                      <th
                        key={i}
                        scope="col"
                        abbr={WEEKDAY_NAMES[i]}
                        className="pb-3 text-sm font-medium text-ink-soft"
                      >
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-display text-xl text-ink">
                  {cal.weeks.map((week, w) => (
                    <tr key={w}>
                      {week.map((d, i) => (
                        <td key={i} className="h-11 p-0">
                          {d === cal.day ? (
                            <span className="mx-auto grid size-10 place-items-center rounded-full bg-ink text-on-ink">
                              {d}
                            </span>
                          ) : (
                            d
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol className="flex flex-col lg:col-span-6 lg:col-start-7 lg:self-center">
              {g.schedule.map((s) => (
                <li
                  key={s.time + s.text}
                  className="grid grid-cols-[6.25rem_1fr] gap-x-5 border-t border-line-soft py-5 last:border-b sm:grid-cols-[8rem_1fr] sm:gap-x-6"
                >
                  <p className="font-display text-2xl text-ink tabular-nums sm:text-3xl">
                    {s.time}
                  </p>
                  <p className="self-center text-base text-ink">{s.text}</p>
                </li>
              ))}
            </ol>
          </Block>
        </div>

        {/* Missões */}
        {g.missions?.length ? (
          <>
            <TileBand design="trama" />
            <Block id="padrinhos-missoes" title="Missões">
              <ul className="grid gap-x-[var(--grid-gap)] gap-y-12 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-3">
                {g.missions.map((m) => (
                  <li key={m.title} className="flex gap-5">
                    <span className="grid size-14 shrink-0 place-items-center rounded-full border-[1.5px] border-line text-accent">
                      <LineIcon name={iconForText(m.title)} className="size-7" />
                    </span>
                    <div className="flex flex-col gap-1.5 pt-1">
                      <h3 className="text-lg font-medium text-ink">{m.title}</h3>
                      <p className="text-base text-ink-soft">{m.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {g.missionsClosing ? (
                <p className="font-display text-display-sm text-ink lg:col-span-10">
                  {g.missionsClosing}
                </p>
              ) : null}
            </Block>
          </>
        ) : null}

        {/* Músicas e fotos: a cápsula do manual. */}
        {g.music ? (
          <section className="pb-[var(--section-space)]" aria-labelledby="padrinhos-musica">
            <div className="page-wrap">
              <div className="surface-relevo card-relevo grid gap-10 rounded-[2.5rem] px-7 py-12 sm:px-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,5fr)] lg:items-center lg:gap-12 lg:rounded-full lg:px-24 lg:py-16">
                <h2 id="padrinhos-musica" className={h2}>
                  Músicas e fotos
                </h2>
                <div className="flex flex-col items-start gap-4">
                  <LineIcon name="nota" className="size-8 text-accent" />
                  <p className="text-lg text-ink">{g.music.text}</p>
                  {g.music.playlistUrl ? (
                    <ButtonLink
                      href={g.music.playlistUrl}
                      target="_blank"
                      rel="noopener"
                      variant="primary"
                    >
                      Adicionar músicas à playlist
                    </ButtonLink>
                  ) : null}
                </div>
                <div className="flex flex-col items-start gap-4">
                  <LineIcon name="camera" className="size-8 text-accent" />
                  <p className="text-lg text-ink">{g.music.albumText}</p>
                  {g.music.albumUrl ? (
                    <ButtonLink
                      href={g.music.albumUrl}
                      target="_blank"
                      rel="noopener"
                      variant="secondary"
                    >
                      Abrir o álbum
                    </ButtonLink>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Para o grande dia: o arco marinho do manual. */}
        {g.bigDay?.length || g.notes.length ? (
          <section className="pb-[var(--section-space)]" aria-labelledby="padrinhos-dia">
            <div className="page-wrap page-grid">
              <div className="card-marinho shape-arch flex flex-col items-center px-7 pt-[clamp(5rem,20vw,8rem)] pb-14 text-center [--arch-rise:clamp(8rem,34vw,16rem)] sm:px-12 lg:col-span-8 lg:col-start-3">
                <h2 id="padrinhos-dia" className={h2}>
                  Para o grande dia
                </h2>
                <ul className="mt-10 flex max-w-[34rem] flex-col items-center gap-9">
                  {(g.bigDay?.length ? g.bigDay : g.notes).map((n, i) => (
                    <li key={n} className="flex flex-col items-center gap-3">
                      <LineIcon
                        name={iconForText(n, i === 0 ? "relogio" : "tacas")}
                        className="size-8 text-accent"
                      />
                      <p className="text-lg text-ink">{n}</p>
                    </li>
                  ))}
                </ul>
                {g.bigDay?.length && g.notes.length ? (
                  <ul className="mt-10 flex max-w-[34rem] flex-col gap-3 border-t border-line-soft pt-8 text-base text-ink-soft">
                    {g.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* Versículo: um selo quieto no fecho da página. */}
        {g.verse ? (
          <section className="pb-[var(--section-space)]" aria-label="Versículo">
            <figure className="page-wrap flex justify-center">
              <div className="relative flex aspect-square w-full max-w-[22rem] items-center justify-center rounded-full border border-line-soft px-[12%] text-center outline-1 outline-offset-[-10px] outline-line-soft sm:max-w-[30rem]">
                <div className="flex w-full flex-col items-center gap-4 sm:gap-5">
                  <MonogramDG bold={10} className="w-12 text-accent sm:w-14" />
                  <blockquote className="font-display text-lg leading-snug text-ink italic sm:text-2xl">
                    {g.verse.text}
                  </blockquote>
                  <figcaption className="text-sm font-medium text-ink-soft">
                    {g.verse.reference}
                  </figcaption>
                </div>
              </div>
            </figure>
          </section>
        ) : null}
      </main>
    </PageTransition>
  );
}
