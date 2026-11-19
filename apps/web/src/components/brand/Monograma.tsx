import { cx } from "@/lib/cx";
import { MonogramDG, type MonogramDGProps } from "./MonogramDG";

export type MonogramaProps = MonogramDGProps & {
  /** Iniciais em texto (eventos sem arte própria); null/ausente = a ligadura DG. */
  iniciais?: string | null;
};

/**
 * Monograma do evento: a ligadura DG desenhada no casamento original e, nos outros
 * eventos, as iniciais do nome em texto, na mesma caixa (mesma proporção do DG), então
 * as classes de largura de cada lugar continuam valendo. Funciona em Server e Client.
 */
export function Monograma({ iniciais, className, style, label, bold }: MonogramaProps) {
  if (!iniciais)
    return <MonogramDG className={className} style={style} label={label} bold={bold} />;
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
  return (
    <svg
      viewBox="0 0 822 492"
      className={cx("mono-dg", className)}
      style={style}
      focusable="false"
      data-mono=""
      {...a11y}
    >
      <text
        x="411"
        y="250"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontFamily="var(--font-serif), Georgia, serif"
        fontSize={iniciais.length > 2 ? 300 : 400}
        letterSpacing="8"
      >
        {iniciais}
      </text>
    </svg>
  );
}
