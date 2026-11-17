import type { WallMessage } from "@casamento/shared";
import { cx } from "@/lib/cx";
import { Bilhete } from "./Bilhete";
import styles from "./recados.module.css";

/**
 * Os bilhetes do mural. `layout="colunas"` (página /recados) enche colunas; `"fileira"`
 * (home) põe os recados lado a lado. Cada bilhete tem uma inclinação própria e "assenta"
 * ao entrar na tela, como as polaroids.
 */
export function Mural({
  recados,
  timeZone,
  layout = "colunas",
  label,
}: {
  recados: WallMessage[];
  timeZone: string;
  layout?: "colunas" | "fileira";
  label: string;
}) {
  return (
    <ul className={layout === "colunas" ? styles.grade : styles.fileira} aria-label={label}>
      {recados.map((r, i) => (
        <li key={`${r.createdAt}-${i}`} className={layout === "colunas" ? styles.item : undefined}>
          <Bilhete
            recado={r}
            timeZone={timeZone}
            className={cx(`r${(i % 6) + 1}`, i % 2 ? "assenta-d" : "assenta")}
          />
        </li>
      ))}
    </ul>
  );
}
