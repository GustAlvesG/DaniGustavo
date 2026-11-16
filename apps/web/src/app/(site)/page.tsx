import { Hero } from "@/components/hero/Hero";
import { DressCode, Questions, Schedule, Stay } from "@/components/home/InfoSections";
import { Wedding } from "@/components/home/Wedding";
import { Opening } from "@/components/opening";
import { PageTransition } from "@/components/site/PageTransition";
import { Story } from "@/components/story/Story";
import { TileBand } from "@/components/tiles";
import { heroFromSite } from "@/content/placeholder";
import { getSite } from "@/lib/api/site";

// Página estática (pré-renderizada com o cache de /api/site): o hero sai
// pronto no HTML e é o LCP; a abertura é uma ilha cliente que anima por cima.
export default async function Home() {
  const site = await getSite();
  return (
    <>
      <Opening />
      <PageTransition>
        <main id="conteudo">
          <Hero {...heroFromSite(site)} />
          <div className="hidden lg:block">
            <TileBand design="onda" />
          </div>
          {site.story.length ? <Story moments={site.story} /> : null}
          <Wedding site={site} />
          {site.schedule.length ? <Schedule items={site.schedule} /> : null}
          <DressCode dressCode={site.dressCode} />
          <Stay accommodation={site.accommodation} />
          {site.faq.length ? <Questions faq={site.faq} /> : null}
        </main>
      </PageTransition>
    </>
  );
}
