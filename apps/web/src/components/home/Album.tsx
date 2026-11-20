import { Cabecalho, FotoImg } from "@/components/album";
import { ButtonLink } from "@/components/ui";
import type { SiteContent } from "@casamento/shared";
import { cx } from "@/lib/cx";
import { moduleAvailable } from "@/lib/site";
import styles from "./home.module.css";

const TILTS = ["r2", "r1", "r4", "r3", "r6", "r5"];

/** Do nosso álbum: polaroids na proporção de cada foto, em colunas. */
export function Album({ site, pagina }: { site: SiteContent; pagina?: number }) {
  const { album } = site.sections;
  const galleryLink = album.galleryLink && moduleAvailable(site, "gallery");
  return (
    <section className={cx(styles.sec, styles.semTopo)} id="album" aria-labelledby="album-titulo">
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="album-titulo"
          pagina={pagina}
          rotulo={album.label}
          titulo={album.title}
          lead={album.lead || undefined}
        />
        <div className={styles.album}>
          {album.photos.map((f, i) => (
            <figure
              key={f.photo.src + i}
              className={cx(styles.fotoAlbum, i % 2 ? "assenta-d" : "assenta")}
            >
              <div className={cx("polaroid", TILTS[i % TILTS.length])}>
                <FotoImg
                  foto={f.photo}
                  sizes="(max-width: 620px) 45vw, (max-width: 1000px) 45vw, 340px"
                />
              </div>
              <figcaption>{f.caption}</figcaption>
            </figure>
          ))}
        </div>
        {galleryLink ? (
          <p className={cx(styles.maisFotos, "rv")}>
            <ButtonLink href="/galeria" variant="secondary">
              {album.galleryLink}
            </ButtonLink>
          </p>
        ) : null}
      </div>
    </section>
  );
}
