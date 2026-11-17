import type { WallMessage } from "@casamento/shared";
import { cx } from "@/lib/cx";
import styles from "./recados.module.css";

const dia = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));

/** Um recado do mural: bilhete de papel com fita, nome em caixa alta e a data. */
export function Bilhete({
  recado,
  timeZone,
  className,
}: {
  recado: WallMessage;
  timeZone: string;
  className?: string;
}) {
  return (
    <figure className={cx(styles.bilhete, className)}>
      <blockquote className={styles.texto}>{recado.body}</blockquote>
      <figcaption className={styles.rodape}>
        <span className={styles.autor}>{recado.author}</span>
        <time className={styles.data} dateTime={recado.createdAt}>
          {dia(recado.createdAt, timeZone)}
        </time>
      </figcaption>
    </figure>
  );
}
