import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Swatches } from "@/components/home/Swatches";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TileBand, type TileDesign } from "@/components/tiles";
import { SectionHeading } from "@/components/ui";
import { getSite } from "@/lib/api/site";

export const metadata: Metadata = {
  title: "Manual dos padrinhos",
  description: "Traje, horários e recados para madrinhas e padrinhos.",
};

const row =
  "grid grid-cols-[5.5rem_1fr] gap-x-6 border-t border-cobalto/20 py-5 last:border-b sm:grid-cols-[8rem_1fr]";
const h2 = "font-display text-display-sm text-tinta";
const linkClass =
  "inline-flex min-h-11 items-center self-start text-cobalto underline underline-offset-[0.22em]";

/** Bloco do manual: faixa de azulejo, título à esquerda e conteúdo à direita. */
function Block({
  id,
  title,
  band,
  children,
}: {
  id: string;
  title: string;
  band: TileDesign;
  children: ReactNode;
}) {
  return (
    <>
      <TileBand design={band} />
      <section className="section-space" aria-labelledby={id}>
        <div className="page-wrap page-grid gap-y-10">
          <h2 id={id} className={`${h2} lg:col-span-4`}>
            {title}
          </h2>
          <div className="flex flex-col gap-10 lg:col-span-7 lg:col-start-6">{children}</div>
        </div>
      </section>
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-5">
      {items.map((n) => (
        <li key={n} className="flex items-baseline gap-4 text-lg text-tinta">
          <span aria-hidden="true" className="size-2.5 shrink-0 rotate-45 border border-cobalto" />
          {n}
        </li>
      ))}
    </ul>
  );
}

export default async function GodparentsPage() {
  const { godparents: g } = await getSite();
  return (
    <PageTransition>
      <SiteHeader band="laco" />
      <main id="conteudo" className="flex-1">
        <section className="section-space" aria-labelledby="padrinhos-titulo">
          <div className="page-wrap page-grid">
            <div className="lg:col-span-8">
              <SectionHeading
                as="h1"
                id="padrinhos-titulo"
                lead={
                  g.invitation ??
                  "Obrigado por estar do nosso lado no altar. Aqui está o que combinar antes do dia."
                }
              >
                Manual dos padrinhos
              </SectionHeading>
            </div>
          </div>
        </section>

        <Block id="padrinhos-traje" title="Traje" band="flor">
          <p className="max-w-[40ch] text-xl text-tinta">{g.dressCode}</p>
          {g.bridesmaids ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-medium text-tinta">Madrinhas</h3>
              <p className="max-w-[60ch] text-base text-tinta/85">{g.bridesmaids.text}</p>
            </div>
          ) : null}
          {g.groomsmen ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-medium text-tinta">Padrinhos</h3>
              <p className="text-base font-medium text-tinta">{g.groomsmen.summary}</p>
              <p className="max-w-[60ch] text-base text-tinta/85">{g.groomsmen.text}</p>
            </div>
          ) : null}
          {g.palette.length ? (
            <div>
              <h3 className="mb-5 text-lg font-medium text-tinta">Paleta</h3>
              <Swatches colors={g.palette} label="Paleta dos padrinhos" />
            </div>
          ) : null}
        </Block>

        <Block id="padrinhos-horarios" title="Horários" band="estrela">
          <ol className="flex flex-col">
            {g.schedule.map((s) => (
              <li key={s.time + s.text} className={row}>
                <p className="font-display text-3xl text-tinta tabular-nums">{s.time}</p>
                <p className="self-center text-base text-tinta">{s.text}</p>
              </li>
            ))}
          </ol>
        </Block>

        {g.missions?.length ? (
          <Block id="padrinhos-missoes" title="Missões" band="trama">
            <ul className="grid gap-x-[var(--grid-gap)] gap-y-8 sm:grid-cols-2">
              {g.missions.map((m) => (
                <li key={m.title} className="flex flex-col gap-1.5 border-t border-cobalto/20 pt-5">
                  <h3 className="text-lg font-medium text-tinta">{m.title}</h3>
                  <p className="text-base text-tinta/85">{m.text}</p>
                </li>
              ))}
            </ul>
            {g.missionsClosing ? (
              <p className="font-display text-3xl text-tinta">{g.missionsClosing}</p>
            ) : null}
          </Block>
        ) : null}

        {g.bigDay?.length || g.notes.length ? (
          <Block id="padrinhos-dia" title="Para o grande dia" band="ramo">
            <Bullets items={g.bigDay?.length ? g.bigDay : g.notes} />
            {g.bigDay?.length && g.notes.length ? <Bullets items={g.notes} /> : null}
          </Block>
        ) : null}

        {g.music ? (
          <Block id="padrinhos-musica" title="Música e fotos" band="onda">
            <div className="flex flex-col gap-3">
              <p className="max-w-[60ch] text-lg text-tinta">{g.music.text}</p>
              {g.music.playlistUrl ? (
                <a href={g.music.playlistUrl} target="_blank" rel="noopener" className={linkClass}>
                  Adicionar músicas à playlist
                </a>
              ) : (
                <p className="text-base text-tinta/75">O link da playlist chega em breve.</p>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <p className="max-w-[60ch] text-lg text-tinta">{g.music.albumText}</p>
              {g.music.albumUrl ? (
                <a href={g.music.albumUrl} target="_blank" rel="noopener" className={linkClass}>
                  Abrir o álbum
                </a>
              ) : (
                <p className="text-base text-tinta/75">O link do álbum chega em breve.</p>
              )}
            </div>
          </Block>
        ) : null}

        {g.verse ? (
          <>
            <TileBand design="moldura" />
            <section className="section-space" aria-label="Versículo">
              <figure className="page-wrap page-grid">
                <blockquote className="font-display text-display-sm text-tinta lg:col-span-8">
                  {g.verse.text}
                </blockquote>
                <figcaption className="mt-6 text-lg text-tinta/80 lg:col-span-8">
                  {g.verse.reference}
                </figcaption>
              </figure>
            </section>
          </>
        ) : null}
      </main>
    </PageTransition>
  );
}
