import { Cabecalho, FotoImg } from "@/components/album";
import { ButtonLink } from "@/components/ui";
import type { HomeContent } from "@/content/home";
import { cx } from "@/lib/cx";
import styles from "./home.module.css";

const TILTS = ["r2", "r1", "r4", "r3", "r6", "r5"];

/** Do nosso álbum: polaroids na proporção de cada foto, em colunas. */
export function Album({ home, pagina }: { home: HomeContent; pagina?: number }) {
  const { album } = home;
  return (
    <section className={cx(styles.sec, styles.semTopo)} id="album" aria-labelledby="album-titulo">
      <div className={styles.wrap}>
        <Cabecalho
          className={styles.cab}
          id="album-titulo"
          pagina={pagina}
          rotulo={album.rotulo}
          titulo={album.titulo}
        />
        <div className={styles.album}>
          {album.fotos.map((f, i) => (
            <figure
              key={f.arquivo + i}
              className={cx(styles.fotoAlbum, i % 2 ? "assenta-d" : "assenta")}
            >
              <div className={cx("polaroid", TILTS[i % TILTS.length])}>
                <FotoImg
                  foto={f}
                  sizes="(max-width: 620px) 45vw, (max-width: 1000px) 45vw, 340px"
                />
              </div>
              <figcaption>{f.legenda}</figcaption>
            </figure>
          ))}
        </div>
        {album.linkGaleria ? (
          <p className={cx(styles.maisFotos, "rv")}>
            <ButtonLink href="/galeria" variant="secondary">
              {album.linkGaleria}
            </ButtonLink>
          </p>
        ) : null}
      </div>
    </section>
  );
}
