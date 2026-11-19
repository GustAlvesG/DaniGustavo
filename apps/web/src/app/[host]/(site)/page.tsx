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
import type { SecaoHome } from "@/content/home";
import { currentEvent } from "@/lib/api/event";
import { getWall } from "@/lib/api/messages";
import { getContent, getSite } from "@/lib/api/site";
import { hostUrl } from "@/lib/site";

/*
 * Home (Proposta C, "Álbum"). Página estática por host: pré-renderizada com o
 * cache de /api/e/<slug>/site, então o hero sai pronto no HTML. Textos e fotos
 * de apresentação vêm de lib/legacy-content (o casamento original ou a versão
 * neutra); dados do evento, da API.
 *
 * A ordem das seções é a de `home.secoes`; seções sem dado no banco
 * (ex.: programação vazia) somem sozinhas.
 */
export default async function Home() {
  const ev = await currentEvent();
  const [site, wall] = await Promise.all([getSite(ev), getWall(ev)]);
  const { home, iniciais } = await getContent(ev);
  const agenda = { slug: ev.slug, type: ev.type, baseUrl: hostUrl(ev.primaryHost) };

  // Numeração "Página N" só nas seções com rótulo (o versículo não conta).
  let page = 0;
  const next = () => (home.numerarPaginas ? ++page : undefined);

  const render: Record<SecaoHome, () => ReactNode> = {
    historia: () =>
      home.historia.momentos.length ? <Historia home={home} pagina={next()} /> : null,
    album: () => (home.album.fotos.length ? <Album home={home} pagina={next()} /> : null),
    casamento: () => <Casamento home={home} site={site} agenda={agenda} pagina={next()} />,
    versiculo: () => <Versiculo home={home} />,
    programacao: () =>
      site.schedule.length ? <Programacao home={home} site={site} pagina={next()} /> : null,
    traje: () =>
      site.dressCode.text || site.dressCode.palette.length || home.traje.foto ? (
        <Traje home={home} site={site} pagina={next()} />
      ) : null,
    presentes: () => <Presentes home={home} pagina={next()} />,
    recados: () => (
      <Recados home={home} wall={wall} timeZone={site.wedding.timezone} pagina={next()} />
    ),
    rsvp: () => <Rsvp home={home} site={site} iniciais={iniciais} pagina={next()} />,
    duvidas: () => (site.faq.length ? <Duvidas home={home} site={site} pagina={next()} /> : null),
  };

  return (
    <PageTransition>
      {/* timeline-scope: o menu (fora do <main>) lê a linha do tempo do hero. */}
      <div className={styles.page}>
        <SiteNav site={site} variant="home" />
        <main id="conteudo">
          <Hero home={home} site={site} iniciais={iniciais} />
          {home.secoes.map((s) => (
            <Fragment key={s}>{render[s]()}</Fragment>
          ))}
        </main>
      </div>
    </PageTransition>
  );
}
