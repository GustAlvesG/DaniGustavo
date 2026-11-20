import type { PaletteColor } from "@casamento/shared";

/**
 * Paleta como amostras redondas (as do traje na home): o círculo na cor, com
 * fio fino e sombra de papel, e o nome embaixo.
 */
export function Swatches({ colors, label }: { colors: PaletteColor[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
      {colors.map((c) => (
        <li key={c.hex + c.name} className="flex flex-col items-center gap-4 text-center">
          <span
            aria-hidden="true"
            className="block aspect-square w-full max-w-[92px] rounded-full shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-tinta)_20%,transparent),0_10px_20px_-12px_color-mix(in_srgb,var(--color-marinho)_50%,transparent)]"
            style={{ backgroundColor: c.hex }}
          />
          <span className="text-lg leading-tight font-medium text-ink">{c.name}</span>
        </li>
      ))}
    </ul>
  );
}
