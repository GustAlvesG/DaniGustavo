"use client";

import { useEffect, useState } from "react";
import { Countdown } from "@/components/countdown";
import { Button } from "@/components/ui";
import { describeCountdown, diffParts } from "@/lib/countdown";
import { Caption } from "./section";

export const WEDDING_AT = "2027-04-10T16:00:00-03:00";

/** Relógio fixo da prancha (determinístico no servidor e no cliente). */
const START = Date.parse("2026-11-16T09:58:57-03:00");
const STEP = 61 * 60_000 + 1_000;

/**
 * Contagem com relógio controlado: "Avançar 1 h" soma 61 min e 1 s (horas,
 * minutos e segundos rolam juntos); "Andar" faz o relógio da prancha correr
 * de segundo em segundo, como no site.
 */
export function CountdownDemo({
  sizes = ["sm", "md"],
  details = false,
}: {
  sizes?: ("sm" | "md")[];
  /** Mostra ao lado a frase do leitor de tela e as regras da contagem. */
  details?: boolean;
}) {
  const [now, setNow] = useState(START);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow((n) => n + 1_000), 1_000);
    return () => window.clearInterval(id);
  }, [running]);

  const demo = (
    <div className="flex flex-col gap-10">
      {sizes.map((size) => (
        <div key={size} className="flex flex-col gap-3">
          <Countdown target={WEDDING_AT} now={now} size={size} />
          <Caption>
            size=&quot;{size}&quot;, {size === "sm" ? "display-sm" : "display-md"}
          </Caption>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button variant="secondary" onClick={() => setRunning((r) => !r)}>
          {running ? "Parar" : "Andar"}
        </Button>
        <Button variant="secondary" onClick={() => setNow((n) => n + STEP)}>
          Avançar 1 h
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setRunning(false);
            setNow(START);
          }}
        >
          Voltar ao início
        </Button>
      </div>
    </div>
  );

  if (!details) return demo;

  return (
    <div className="page-grid gap-y-14">
      <div className="lg:col-span-8">{demo}</div>
      <dl className="flex flex-col gap-6 border-t border-line-soft pt-6 lg:col-span-4 lg:col-start-9 lg:self-start">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-ink-soft">O leitor de tela ouve</dt>
          <dd className="text-lg text-ink">{describeCountdown(diffParts(now, WEDDING_AT))}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-ink-soft">Segundos</dt>
          <dd className="text-base text-ink-soft">
            Um só relógio por página, alinhado à virada do segundo. Cada unidade assina o próprio
            valor: a cada tique só o dígito que mudou re-renderiza. O leitor de tela não ouve os
            segundos.
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-ink-soft">No dia e depois</dt>
          <dd className="text-base text-ink-soft">
            No dia, a contagem dá lugar a &ldquo;É hoje&rdquo;. A partir do dia seguinte, a
            &ldquo;Casamos em 10 de abril de 2027&rdquo;.
          </dd>
        </div>
      </dl>
    </div>
  );
}
