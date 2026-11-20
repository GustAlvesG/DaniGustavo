import type { Metadata } from "next";
import type { GalleryPhoto } from "@casamento/shared";
import { Polaroid } from "@/components/album";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { SectionHeading } from "@/components/ui";
import { getSite, getSiteWithModule } from "@/lib/api/site";
import { cx } from "@/lib/cx";
import { galleryGroups } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return { title: "Galeria", description: `Fotos de ${site.couple.names}.` };
}

const TILTS = ["r2", "r1", "r4", "r3", "r6", "r5"];

/**
 * Galeria: as fotos do evento (`event_media` marcadas para a galeria) como polaroids em
 * colunas, cada uma na proporção do arquivo, separadas por álbum quando houver. Clicar abre a
 * foto inteira numa nova aba. Módulo desligado ou galeria vazia → 404.
 */
export default async function GalleryPage() {
  const site = await getSiteWithModule("gallery");
  const page = site.sections.pages.gallery;
  const groups = galleryGroups(site.gallery.items);
  const soon = site.gallery.officialPhotosSoon && page.soonNotice;
  return (
    <PageTransition>
      <SiteNav site={site} current="/galeria" />
      <main id="conteudo" className="below-nav flex-1">
        <div className="page-wrap section-space">
          <SectionHeading
            as="h1"
            id="galeria-titulo"
            rotulo={site.event.type === "wedding" ? "Do nosso álbum" : "Álbum de fotos"}
            className="mx-auto mb-16 max-w-[640px] items-center text-center"
            lead={soon || undefined}
          >
            {page.title || "Galeria"}
          </SectionHeading>
          {groups.map((g, gi) => (
            <section key={g.album ?? ""} aria-labelledby={g.album ? `album-${gi}` : undefined}>
              {g.album ? (
                <h2 id={`album-${gi}`} className="titulo mt-6 mb-10 text-center">
                  {g.album}
                </h2>
              ) : null}
              <Fotos photos={g.photos} labelledBy={g.album ? `album-${gi}` : "galeria-titulo"} />
            </section>
          ))}
        </div>
      </main>
    </PageTransition>
  );
}

function Fotos({ photos, labelledBy }: { photos: GalleryPhoto[]; labelledBy: string }) {
  return (
    <ul
      aria-labelledby={labelledBy}
      className="columns-2 gap-[18px] sm:gap-[34px] lg:columns-3"
      data-gallery=""
    >
      {photos.map((f, i) => (
        <li
          key={f.src}
          className={cx("mb-7 break-inside-avoid pt-3 sm:mb-10", i % 2 ? "assenta-d" : "assenta")}
        >
          <a
            href={f.src}
            target="_blank"
            rel="noopener"
            className="block"
            aria-label={`${f.alt} (abre em nova aba)`}
          >
            <Polaroid
              as="div"
              foto={f}
              formato="natural"
              legenda={f.caption || undefined}
              sizes="(min-width: 1024px) 340px, 45vw"
              className={TILTS[i % TILTS.length]}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
