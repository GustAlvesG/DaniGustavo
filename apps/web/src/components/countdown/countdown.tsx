"use client";

import { memo, useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import {
  COUNTDOWN_UNITS,
  countdownPhase,
  describeCountdown,
  diffParts,
  formatWeddingDate,
  msUntilNextSecond,
  pad2,
  unitLabel,
  type CountdownUnit,
} from "@/lib/countdown";

export type CountdownProps = {
  /** Instante do casamento, com fuso (ex.: "2027-04-10T16:00:00-03:00"). */
  target: string;
  /**
   * Relógio controlado (ms desde a época). Sem ele, o componente usa o
   * relógio do aparelho e atualiza a cada virada de segundo. Com ele, a
   * página /dev/design pode avançar o tempo e ver os dígitos rolarem.
   */
  now?: number;
  /** Mensagem no dia do casamento, depois do horário. */
  todayMessage?: string;
  /** Mensagem a partir do dia seguinte. Padrão: "Casamos em 10 de abril de 2027." */
  afterMessage?: string;
  /** Tamanho dos números: "sm" (padrão, display-sm) ou "md" (display-md). */
  size?: "sm" | "md";
  className?: string;
};

const SIZE = { sm: "text-display-sm", md: "text-display-md" } as const;

/*
 * Relógio por segundo, um só para a página: um setTimeout alinhado à virada
 * do segundo do relógio (não um setInterval, que escorrega), reagendado ao
 * voltar para a aba. O snapshot é o segundo atual em cache, e cada unidade
 * (dias, horas, minutos, segundos) assina o próprio valor: a cada tique só
 * a unidade que mudou re-renderiza, e dentro dela só o dígito que mudou
 * (RollingDigit é memo).
 */
const listeners = new Set<() => void>();
let second = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

const readSecond = () => Math.floor(Date.now() / 1000);

function emit() {
  second = readSecond();
  listeners.forEach((fn) => fn());
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(
    () => {
      emit();
      schedule();
    },
    msUntilNextSecond(Date.now()) + 8,
  );
}

function onVisible() {
  if (document.visibilityState === "visible") {
    emit();
    schedule();
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) {
    second = readSecond();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

const getSecond = () => (listeners.size ? second : readSecond());

/** Valor derivado do relógio; no servidor (e na hidratação), null: esqueleto. */
function useClock<T>(derive: (ms: number) => T, now: number | undefined): T | null {
  const live = useSyncExternalStore(
    subscribe,
    () => derive(getSecond() * 1000),
    () => null,
  );
  return now === undefined ? live : derive(now);
}

/**
 * Contagem regressiva em dias, horas, minutos e segundos. Server render:
 * esqueleto com as mesmas dimensões (sem CLS); o cliente preenche após a
 * hidratação.
 */
export function Countdown({
  target,
  now,
  todayMessage,
  afterMessage,
  size = "sm",
  className,
}: CountdownProps) {
  const phase = useClock((ms) => countdownPhase(ms, target), now);

  if (phase === "today" || phase === "after") {
    const message =
      phase === "today"
        ? (todayMessage ?? "É hoje.")
        : (afterMessage ?? `Casamos em ${formatWeddingDate(target)}.`);
    return <p className={cx("font-display text-ink", SIZE[size], className)}>{message}</p>;
  }

  const ready = phase !== null;
  return (
    <div className={cx("text-ink", className)} data-countdown="">
      {ready ? <SpokenCountdown target={target} now={now} /> : null}
      <p
        aria-hidden="true"
        className={cx(
          "flex items-start gap-x-[0.42em] font-display leading-none tabular-nums",
          SIZE[size],
          ready ? "animate-fade-in" : "opacity-0",
        )}
      >
        {COUNTDOWN_UNITS.map((unit) => (
          <UnitView key={unit} unit={unit} target={target} now={now} ready={ready} />
        ))}
      </p>
    </div>
  );
}

/** Frase do leitor de tela (minuto a minuto, sem os segundos). */
function SpokenCountdown({ target, now }: { target: string; now?: number }) {
  const text = useClock((ms) => describeCountdown(diffParts(ms, target)), now);
  return <span className="sr-only">{text}</span>;
}

function UnitView({
  unit,
  target,
  now,
  ready,
}: {
  unit: CountdownUnit;
  target: string;
  now?: number;
  ready: boolean;
}) {
  const value = useClock((ms) => diffParts(ms, target)[unit], now);
  const text =
    value === null || !ready
      ? unit === "days"
        ? "000"
        : "00"
      : unit === "days"
        ? String(value)
        : pad2(value);
  return (
    <span className="inline-flex flex-col items-start gap-[0.32em]" data-unit={unit}>
      <span className="inline-flex">
        {text.split("").map((digit, i) => (
          // A chave conta da direita: as unidades ficam estáveis quando o
          // número perde um dígito (100 → 99).
          <RollingDigit key={text.length - i} digit={digit} />
        ))}
      </span>
      <span className="font-sans text-xs leading-none font-medium tracking-normal text-ink-soft lg:text-sm">
        {unitLabel(unit, value ?? 0)}
      </span>
    </span>
  );
}

/**
 * Um dígito numa máscara: quando muda, o antigo sobe e sai, o novo entra de
 * baixo (320ms, --ease-out). Com movimento reduzido vira um crossfade.
 */
const RollingDigit = memo(function RollingDigit({ digit }: { digit: string }) {
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
});
