import { contrastLevel, contrastRatio, formatRatio } from "@/lib/contrast";
import { cx } from "@/lib/cx";
import { COLOR_INFO, CONTRAST_PAIRS, PALETTE, minimumRatio } from "@/lib/palette";

/** Cores claras pedem texto escuro na amostra. */
const LIGHT = new Set(["serenity", "celeste", "relevo", "branco", "coral"]);

function Chip({ name }: { name: keyof typeof PALETTE }) {
  const info = COLOR_INFO.find((c) => c.name === name)!;
  const hex = PALETTE[name];
  const light = LIGHT.has(name);
  return (
    <figure className="flex flex-col">
      <div
        className="relative flex aspect-[3/2] items-end rounded-[1.75rem] p-5 outline-1 outline-offset-4 outline-line-soft"
        style={{ backgroundColor: hex }}
      >
        <span
          aria-hidden="true"
          className="font-display text-3xl leading-none"
          style={{ color: light ? PALETTE.marinho : PALETTE.branco }}
        >
          Aa
        </span>
      </div>
      <figcaption className="mt-4 flex flex-col">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-lg font-semibold text-ink">{info.label}</span>
          <span className="text-sm text-ink-soft tabular-nums">{hex}</span>
        </div>
        <code className="mt-0.5 font-mono text-xs text-accent">--color-{name}</code>
        <p className="mt-2 text-sm text-ink-soft">{info.usage}</p>
      </figcaption>
    </figure>
  );
}

/** A paleta do casal e todos os pares de texto e fundo que o site usa. */
export function Swatches() {
  return (
    <div className="flex flex-col gap-20">
      <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-5 lg:gap-x-8">
        {COLOR_INFO.map((c) => (
          <Chip key={c.name} name={c.name} />
        ))}
      </div>

      <div className="page-grid gap-y-8">
        <div className="lg:col-span-4">
          <h3 className="font-display text-3xl text-ink">Contraste</h3>
          <p className="mt-3 max-w-[40ch] text-base text-ink-soft">
            Cada par de cor que o site usa, com a razão da WCAG 2.2. Texto comum pede 4,5:1; texto
            grande e elementos de interface (bordas de campo, anel de foco), 3:1. Os mesmos pares
            rodam em src/lib/palette.test.ts.
          </p>
        </div>
        <div className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] lg:col-span-8 lg:mx-0 lg:px-0">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-line-soft text-sm text-ink-soft">
                <th scope="col" className="py-3 pr-4 font-medium">
                  Amostra
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  Uso
                </th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">
                  Razão
                </th>
                <th scope="col" className="py-3 text-right font-medium">
                  Nível
                </th>
              </tr>
            </thead>
            <tbody>
              {CONTRAST_PAIRS.map((p) => {
                const ratio = contrastRatio(PALETTE[p.fg], PALETTE[p.bg]);
                const ok = ratio >= minimumRatio(p.kind);
                return (
                  <tr key={`${p.fg}-${p.bg}-${p.role}`} className="border-b border-line-soft">
                    <td className="py-2.5 pr-4">
                      <span
                        className="inline-flex min-w-[7.5rem] items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium"
                        style={{ color: PALETTE[p.fg], backgroundColor: PALETTE[p.bg] }}
                      >
                        {p.fg} / {p.bg}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-ink">
                      {p.role}
                      <span className="block text-xs text-ink-soft">{p.kind}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-sm font-medium text-ink tabular-nums">
                      {formatRatio(ratio)}
                    </td>
                    <td
                      className={cx(
                        "py-2.5 text-right text-sm tabular-nums",
                        ok ? "text-ink-soft" : "text-danger",
                      )}
                    >
                      {ok ? contrastLevel(ratio) : "falha"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
