import type { PaletteColor } from "@casamento/shared";

/** Paleta de cores como ladrilhos: quadrado na cor, com o nome embaixo. */
export function Swatches({ colors, label }: { colors: PaletteColor[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 gap-x-[var(--grid-gap)] gap-y-8 sm:grid-cols-4"
    >
      {colors.map((c) => (
        <li key={c.hex + c.name} className="flex flex-col gap-3">
          <span
            aria-hidden="true"
            className="relative block aspect-square w-full"
            style={{ backgroundColor: c.hex }}
          >
            <span className="absolute inset-[9%] border border-branco/50" />
          </span>
          <span className="text-base text-tinta">{c.name}</span>
        </li>
      ))}
    </ul>
  );
}
