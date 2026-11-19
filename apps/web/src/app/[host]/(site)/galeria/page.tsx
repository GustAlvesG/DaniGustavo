import type { Metadata } from "next";
import { Polaroid } from "@/components/album";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteNav } from "@/components/site/SiteNav";
import { SectionHeading } from "@/components/ui";
import { galeria } from "@/content/galeria";
import { getSite } from "@/lib/api/site";
import { cx } from "@/lib/cx";
import { foto } from "@/lib/fotos";

export const metadata: Metadata = {
  title: "Galeria",
  description: "Fotos de Dani e Gustavo.",
};

const TILTS = ["r2", "r1", "r4", "r3", "r6", "r5"];

/**
 * Galeria: as fotos de content/galeria.ts como polaroids em colunas, cada
 * uma na proporção do arquivo. Clicar abre a foto inteira numa nova aba.
 * O aviso de "fotos oficiais em breve" é uma chave do banco.
 */
export default async function GalleryPage() {
  const site = await getSite();
  return (
    <PageTransition>
      <SiteNav site={site} current="/galeria" />
      <main id="conteudo" className="below-nav flex-1">
        <div className="page-wrap section-space">
          <SectionHeading
            as="h1"
            id="galeria-titulo"
            rotulo="Do nosso álbum"
            className="mx-auto mb-16 max-w-[640px] items-center text-center"
            lead={site.gallery.officialPhotosSoon ? galeria.avisoPreWedding : undefined}
          >
            {galeria.titulo}
          </SectionHeading>
          <ul
            aria-labelledby="galeria-titulo"
            className="columns-2 gap-[18px] sm:gap-[34px] lg:columns-3"
            data-gallery=""
          >
            {galeria.fotos.map((f, i) => (
              <li
                key={f.arquivo}
                className={cx(
                  "mb-7 break-inside-avoid pt-3 sm:mb-10",
                  i % 2 ? "assenta-d" : "assenta",
                )}
              >
                <a
                  href={foto(f.arquivo).src}
                  target="_blank"
                  rel="noopener"
                  className="block"
                  aria-label={`${f.alt} (abre em nova aba)`}
                >
                  <Polaroid
                    as="div"
                    foto={f}
                    formato="natural"
                    legenda={f.legenda}
                    sizes="(min-width: 1024px) 340px, 45vw"
                    className={TILTS[i % TILTS.length]}
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </PageTransition>
  );
}
