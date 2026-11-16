"use client";

import { useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import {
  countdownPhase,
  describeCountdown,
  diffParts,
  formatWeddingDate,
  msUntilNextMinute,
  pad2,
  unitLabel,
  type CountdownUnit,
} from "@/lib/countdown";

export type CountdownProps = {
  /** Instante do casamento, com fuso (ex.: "2027-05-15T16:00:00-03:00"). */
  target: string;
  /**
   * Relógio controlado (ms desde a época). Sem ele, o componente usa o
   * relógio do aparelho e atualiza a cada virada de minuto. Com ele, a
   * página /dev/design pode avançar o tempo e ver os dígitos rolarem.
   */
  now?: number;
  /** Mensagem no dia do casamento, depois do horário. */
  todayMessage?: string;
  /** Mensagem a partir do dia seguinte. Padrão: "Casamos em 15 de maio de 2027." */
  afterMessage?: string;
  /** Tamanho dos números: "sm" (padrão, display-sm) ou "md" (display-md). */
  size?: "sm" | "md";
  className?: string;
};

const SIZE = { sm: "text-display-sm", md: "text-display-md" } as const;

/*
 * Relógio por minuto: o snapshot é o número do minuto atual, então o React só
 * re-renderiza quando o minuto vira. O timer é agendado para a próxima virada
 * (não um setInterval de 1 s) e reagendado ao voltar para a aba.
 */
const MINUTE = 60_000;

function subscribeMinute(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        onChange();
        schedule();
      },
      msUntilNextMinute(Date.now()) + 20,
    );
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      onChange();
      schedule();
    }
  };
  schedule();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

const getMinute = () => Math.floor(Date.now() / MINUTE);
// No servidor (e na hidratação) não há relógio: renderiza o esqueleto.
const getServerMinute = () => null;

/**
 * Contagem regressiva em dias, horas e minutos. Server render: esqueleto com
 * as mesmas dimensões (sem CLS); o cliente preenche após a hidratação.
 */
export function Countdown({
  target,
  now,
  todayMessage,
  afterMessage,
  size = "sm",
  className,
}: CountdownProps) {
  const minute = useSyncExternalStore(subscribeMinute, getMinute, getServerMinute);
  const instant = now ?? (minute === null ? null : minute * MINUTE);

  if (instant === null) {
    return <CountdownFrame className={className} size={size} parts={null} />;
  }

  const phase = countdownPhase(instant, target);
  if (phase !== "counting") {
    const message =
      phase === "today"
        ? (todayMessage ?? "É hoje.")
        : (afterMessage ?? `Casamos em ${formatWeddingDate(target)}.`);
    return <p className={cx("font-display text-tinta", SIZE[size], className)}>{message}</p>;
  }

  return <CountdownFrame className={className} size={size} parts={diffParts(instant, target)} />;
}

const UNITS: CountdownUnit[] = ["days", "hours", "minutes"];

function CountdownFrame({
  parts,
  size,
  className,
}: {
  parts: ReturnType<typeof diffParts> | null;
  size: "sm" | "md";
  className?: string;
}) {
  return (
    <p className={cx("text-tinta", className)}>
      {parts ? <span className="sr-only">{describeCountdown(parts)}</span> : null}
      <span
        aria-hidden="true"
        className={cx(
          "flex flex-wrap items-baseline gap-x-[0.6em] gap-y-2 font-display tabular-nums",
          SIZE[size],
          parts ? "animate-fade-in" : "opacity-0",
        )}
      >
        {UNITS.map((unit) => {
          const value = parts ? parts[unit] : null;
          const text =
            value === null
              ? unit === "days"
                ? "000"
                : "00"
              : unit === "days"
                ? String(value)
                : pad2(value);
          return (
            <span key={unit} className="inline-flex items-baseline gap-[0.18em]">
              <span className="inline-flex">
                {text.split("").map((digit, i) => (
                  // A chave conta da direita: as unidades ficam estáveis quando
                  // o número perde um dígito (100 → 99).
                  <RollingDigit key={text.length - i} digit={digit} />
                ))}
              </span>
              <span className="font-sans text-sm leading-none font-medium tracking-normal text-tinta/75 lg:text-base">
                {unitLabel(unit, value ?? 0)}
              </span>
            </span>
          );
        })}
      </span>
    </p>
  );
}

/**
 * Um dígito numa máscara: quando muda, o antigo sobe e sai, o novo entra de
 * baixo (320ms, --ease-out). Com movimento reduzido vira um crossfade.
 */
function RollingDigit({ digit }: { digit: string }) {
  const [state, setState] = useState({ current: digit, previous: null as string | null, turn: 0 });
  if (state.current !== digit) {
    // Atualização durante a renderização (padrão do React para derivar estado de props).
    setState({ current: digit, previous: state.current, turn: state.turn + 1 });
  }
  const animate = state.previous !== null;

  return (
    <span className="relative inline-block overflow-clip leading-none [overflow-clip-margin:0.08em]">
      {animate ? (
        <span
          key={`out-${state.turn}`}
          data-motion="keep"
          className="absolute inset-0 animate-roll-out motion-reduce:animate-fade-out"
        >
          {state.previous}
        </span>
      ) : null}
      <span
        key={`in-${state.turn}`}
        data-motion="keep"
        className={cx("inline-block", animate && "animate-roll-in motion-reduce:animate-fade-in")}
      >
        {state.current}
      </span>
    </span>
  );
}
