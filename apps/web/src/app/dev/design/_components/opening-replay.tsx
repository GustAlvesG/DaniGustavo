"use client";

import { useState } from "react";
import { Opening } from "@/components/opening";
import { Button } from "@/components/ui";
import { OPENING_TIMELINE as T, openingDuration } from "@/lib/opening";

const STEPS = [
  {
    label: "Ladrilhos viram em onda a partir do centro",
    at: T.flip.start,
    until: T.flip.start + T.flip.spread + T.flip.duration,
  },
  {
    label: "A cápsula corre da junta e o DG se escreve",
    at: T.draw.start,
    until: T.draw.start + T.draw.duration + T.draw.inkLag + 4 * T.draw.stagger,
  },
  {
    label: "Folhas de porta abrem pelas bordas",
    at: T.doors.start,
    until: T.doors.start + T.doors.duration,
  },
  {
    label: "Nomes sobem por máscara, letra a letra",
    at: T.names.start,
    until: T.names.start + T.names.duration + 11 * T.names.stagger,
  },
];

const fmt = (s: number) => `${s.toFixed(2).replace(".", ",")} s`;

/**
 * Repete a abertura por cima desta página, sem ler nem gravar o
 * sessionStorage. Os nomes que sobem são os da prévia do hero, logo abaixo.
 */
export function OpeningReplay() {
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = openingDuration(5, 12);

  return (
    <div className="flex flex-col gap-8">
      <ol className="flex flex-col border-t border-line-soft">
        {STEPS.map((step) => (
          <li
            key={step.label}
            className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-b border-line-soft py-3"
          >
            <span className="text-base text-ink">{step.label}</span>
            <span className="text-sm text-ink-soft tabular-nums">
              {fmt(step.at)} até {fmt(step.until)}
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-3">
          <span className="text-base font-medium text-ink">Total (teto de 3,2 s)</span>
          <span className="text-sm font-medium text-ink tabular-nums">{fmt(total)}</span>
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="primary"
          onClick={() => {
            setRun((n) => n + 1);
            setPlaying(true);
          }}
        >
          Repetir abertura
        </Button>
        <p className="text-sm text-ink-soft">
          Toque, clique ou qualquer tecla pula. Com movimento reduzido, vira um fade de 200 ms.
        </p>
      </div>
      {playing ? <Opening key={run} forced onDone={() => setPlaying(false)} /> : null}
    </div>
  );
}
