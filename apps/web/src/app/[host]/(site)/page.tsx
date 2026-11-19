import { Fragment, type ReactNode } from "react";
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
import { home, type SecaoHome } from "@/content/home";
import { getWall } from "@/lib/api/messages";
import { getSite } from "@/lib/api/site";

/*
 * Home (Proposta C, "Álbum"). Página estática: pré-renderizada com o cache
 * de /api/site, então o hero sai pronto no HTML. Textos e fotos de
 * apresentação vêm de src/content/home.ts; dados do evento, da API.
 *
 * A ordem das seções é a de `home.secoes`; seções sem dado no banco
 * (ex.: programação vazia) somem sozinhas.
 */
export default async function Home() {
  const [site, wall] = await Promise.all([getSite(), getWall()]);

  // Numeração "Página N" só nas seções com rótulo (o versículo não conta).
  let page = 0;
  const next = () => (home.numerarPaginas ? ++page : undefined);

  const render: Record<SecaoHome, () => ReactNode> = {
    historia: () => (home.historia.momentos.length ? <Historia pagina={next()} /> : null),
    album: () => (home.album.fotos.length ? <Album pagina={next()} /> : null),
    casamento: () => <Casamento site={site} pagina={next()} />,
    versiculo: () => <Versiculo />,
    programacao: () => (site.schedule.length ? <Programacao site={site} pagina={next()} /> : null),
    traje: () => <Traje site={site} pagina={next()} />,
    presentes: () => <Presentes pagina={next()} />,
    recados: () => <Recados wall={wall} timeZone={site.wedding.timezone} pagina={next()} />,
    rsvp: () => <Rsvp site={site} pagina={next()} />,
    duvidas: () => (site.faq.length ? <Duvidas site={site} pagina={next()} /> : null),
  };

  return (
    <PageTransition>
      {/* timeline-scope: o menu (fora do <main>) lê a linha do tempo do hero. */}
      <div className={styles.page}>
        <SiteNav site={site} variant="home" />
        <main id="conteudo">
          <Hero site={site} />
          {home.secoes.map((s) => (
            <Fragment key={s}>{render[s]()}</Fragment>
          ))}
        </main>
      </div>
    </PageTransition>
  );
}
