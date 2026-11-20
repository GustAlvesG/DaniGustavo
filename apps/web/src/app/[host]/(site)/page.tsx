import { Fragment, type ReactNode } from "react";
import type { HomeSectionId } from "@casamento/shared";
import { Album } from "@/components/home/Album";
import { Casamento } from "@/components/home/Casamento";
import { Duvidas } from "@/components/home/Duvidas";
import { Hero } from "@/components/home/Hero";
import { Historia } from "@/components/home/Historia";
import { Presentes } from "@/components/home/Presentes";
import { Recados } from "@/components/home/Recados";
import { Programacao } from "@/components/home/Programacao";
import { Rsvp } from "@/components/home/Rsvp";
import { Traje } from "@/components/home/Traje";
import { Versiculo } from "@/components/home/Versiculo";
import styles from "@/components/home/home.module.css";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { currentEvent } from "@/lib/api/event";
import { getWall } from "@/lib/api/messages";
import { getMonogram, getSite } from "@/lib/api/site";
import { homeSections, hostUrl } from "@/lib/site";

/*
 * Home (Proposta C, "Álbum"). Página estática por host: pré-renderizada com o
 * cache de /api/e/<slug>/site, então o hero sai pronto no HTML. Textos, fotos, ordem das
 * seções, módulos e vocabulário vêm todos de lá (`site.sections`, `site.event`).
 *
 * Seções desligadas no editor, de módulo desligado ou sem dado (ex.: programação vazia)
 * somem sozinhas (`homeSections` em lib/site, a mesma regra do menu).
 */
export default async function Home() {
  const ev = await currentEvent();
  const site = await getSite(ev);
  const [wall, iniciais] = await Promise.all([
    site.event.modules.messages ? getWall(ev) : null,
    getMonogram(ev),
  ]);
  const agenda = { slug: ev.slug, type: ev.type, baseUrl: hostUrl(ev.primaryHost) };

  // Numeração "Página N" só nas seções com rótulo (a citação não conta).
  let page = 0;
  const next = () => (site.sections.numberPages ? ++page : undefined);

  const render: Record<HomeSectionId, () => ReactNode> = {
    story: () => <Historia site={site} pagina={next()} />,
    album: () => <Album site={site} pagina={next()} />,
    event: () => <Casamento site={site} agenda={agenda} pagina={next()} />,
    verse: () => <Versiculo site={site} />,
    schedule: () => <Programacao site={site} pagina={next()} />,
    dresscode: () => <Traje site={site} pagina={next()} />,
    gifts: () => <Presentes site={site} pagina={next()} />,
    messages: () => (wall ? <Recados site={site} wall={wall} pagina={next()} /> : null),
    rsvp: () => <Rsvp site={site} iniciais={iniciais} pagina={next()} />,
    faq: () => <Duvidas site={site} pagina={next()} />,
  };

  return (
    <PageTransition>
      {/* timeline-scope: o menu (fora do <main>) lê a linha do tempo do hero. */}
      <div className={styles.page}>
        <SiteNav site={site} variant="home" />
        <main id="conteudo">
          <Hero site={site} iniciais={iniciais} />
          {homeSections(site).map((s) => (
            <Fragment key={s}>{render[s]()}</Fragment>
          ))}
        </main>
      </div>
    </PageTransition>
  );
}
