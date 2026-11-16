import type { PaletteColor } from "@casamento/shared";

/**
 * Paleta como selos: um círculo na cor, com um fio claro por fora (a cor
 * escura não some no marinho) e o nome embaixo.
 */
export function Swatches({ colors, label }: { colors: PaletteColor[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
      {colors.map((c) => (
        <li key={c.hex + c.name} className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden="true"
            className="block aspect-square w-full max-w-[7.5rem] rounded-full outline-1 outline-offset-4 outline-line-soft"
            style={{ backgroundColor: c.hex }}
          />
          <span className="text-base text-ink">{c.name}</span>
        </li>
      ))}
    </ul>
  );
}
