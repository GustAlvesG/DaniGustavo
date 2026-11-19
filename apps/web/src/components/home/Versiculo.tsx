import { FotoImg } from "@/components/album";
import type { HomeContent } from "@/content/home";
import { cx } from "@/lib/cx";
import styles from "./home.module.css";

const DELAYS = ["", "d1", "d2", "d3"];

/** Versículo sobre foto escura: as linhas sobem uma depois da outra. */
export function Versiculo({ home }: { home: HomeContent }) {
  const { versiculo } = home;
  if (!versiculo.foto || !versiculo.linhas.length) return null;
  return (
    <section className={styles.versiculo} id="versiculo" aria-label="Versículo">
      <div className={styles.versiculoBg}>
        <FotoImg foto={{ ...versiculo.foto, alt: "" }} sizes="100vw" fill />
      </div>
      <div className={styles.versiculoVeu} />
      <blockquote>
        {versiculo.linhas.map((linha, i) => (
          <span key={i} className={cx("rv", DELAYS[Math.min(i, 2)])}>
            {linha}
          </span>
        ))}
      </blockquote>
      <cite className="rv d3">{versiculo.referencia}</cite>
    </section>
  );
}
