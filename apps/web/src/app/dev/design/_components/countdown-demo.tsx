"use client";

import { useState } from "react";
import { Countdown } from "@/components/countdown";
import { Button } from "@/components/ui";
import { describeCountdown, diffParts } from "@/lib/countdown";
import { Caption } from "./section";

export const WEDDING_AT = "2027-05-15T16:00:00-03:00";

/** Relógio fixo da prancha (determinístico no servidor e no cliente). */
const START = Date.parse("2026-11-16T09:58:00-03:00");
const STEP = 61 * 60_000;

/**
 * Contagem com relógio controlado: "Avançar 1 h" soma 61 minutos, então
 * horas e minutos mudam juntos e os dígitos rolam.
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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button variant="secondary" onClick={() => setNow((n) => n + STEP)}>
          Avançar 1 h
        </Button>
        <Button variant="quiet" onClick={() => setNow(START)}>
          Voltar ao início
        </Button>
      </div>
    </div>
  );

  if (!details) return demo;

  return (
    <div className="page-grid gap-y-14">
      <div className="lg:col-span-8">{demo}</div>
      <dl className="flex flex-col gap-6 border-t border-nevoa pt-6 lg:col-span-4 lg:col-start-9 lg:self-start">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-tinta/70">O leitor de tela ouve</dt>
          <dd className="text-lg text-tinta">{describeCountdown(diffParts(now, WEDDING_AT))}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-tinta/70">Arredondamento</dt>
          <dd className="text-base text-tinta/85">
            Minutos para cima: faltando 30 segundos, mostra 1 min. Zera só no horário da cerimônia.
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-tinta/70">No dia e depois</dt>
          <dd className="text-base text-tinta/85">
            No dia, a contagem dá lugar a &ldquo;É hoje&rdquo;. A partir do dia seguinte, a
            &ldquo;Casamos em 15 de maio de 2027&rdquo;.
          </dd>
        </div>
      </dl>
    </div>
  );
}
