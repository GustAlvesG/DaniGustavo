import type { Metadata } from "next";
import Image from "next/image";
import { PageTransition } from "@/components/site/PageTransition";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SectionHeading } from "@/components/ui";
import { getSite } from "@/lib/api/site";

export const metadata: Metadata = {
  title: "Galeria",
  description: "Fotos de Dani e Gustavo.",
};

export default async function GalleryPage() {
  const { gallery } = await getSite();
  return (
    <PageTransition>
      <SiteHeader band="onda" />
      <main id="conteudo" className="section-space flex-1">
        <div className="page-wrap page-grid gap-y-12">
          <div className="lg:col-span-7">
            <SectionHeading
              as="h1"
              id="galeria-titulo"
              lead={
                gallery.officialPhotosSoon
                  ? "Por enquanto, o pré-wedding. As fotos oficiais chegam aqui em breve, depois do casamento."
                  : undefined
              }
            >
              Galeria
            </SectionHeading>
          </div>
          {/* Colunas CSS: cada foto mantém a proporção. Clicar abre a foto inteira. */}
          <ul
            aria-labelledby="galeria-titulo"
            className="columns-1 gap-[var(--grid-gap)] sm:columns-2 lg:col-span-12 lg:columns-3"
            data-gallery=""
          >
            {gallery.items.map((photo, i) => (
              <li key={photo.src} className="mb-[var(--grid-gap)] break-inside-avoid">
                <a
                  href={photo.src}
                  target="_blank"
                  rel="noopener"
                  className="block bg-nevoa"
                  aria-label={`${photo.alt} (abre em nova aba)`}
                >
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
                    preload={i < 2}
                    className="block h-auto w-full object-cover"
                    style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
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
