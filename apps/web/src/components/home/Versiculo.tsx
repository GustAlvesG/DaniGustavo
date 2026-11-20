import { FotoImg } from "@/components/album";
import type { SiteContent } from "@casamento/shared";
import { cx } from "@/lib/cx";
import styles from "./home.module.css";

const DELAYS = ["", "d1", "d2", "d3"];

/** Citação (versículo) sobre foto escura: as linhas sobem uma depois da outra. */
export function Versiculo({ site }: { site: SiteContent }) {
  const { verse } = site.sections;
  if (!verse.photo || !verse.lines.length) return null;
  return (
    <section className={styles.versiculo} id="versiculo" aria-label="Versículo">
      <div className={styles.versiculoBg}>
        <FotoImg foto={{ ...verse.photo, alt: "" }} sizes="100vw" fill />
      </div>
      <div className={styles.versiculoVeu} />
      <blockquote>
        {verse.lines.map((linha, i) => (
          <span key={i} className={cx("rv", DELAYS[Math.min(i, 2)])}>
            {linha}
          </span>
        ))}
      </blockquote>
      {verse.reference ? <cite className="rv d3">{verse.reference}</cite> : null}
    </section>
  );
}
