"use client";

import { memo, useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import {
  COUNTDOWN_UNITS,
  countdownPhase,
  describeCountdown,
  diffParts,
  msUntilNextSecond,
  pad2,
  unitLabel,
  type CountdownUnit,
} from "@/lib/countdown";
import styles from "./countdown.module.css";

export type CountdownProps = {
  /** Instante do casamento, com fuso (ex.: "2027-04-10T16:00:00-03:00"). */
  target: string;
  /** Linha acima dos números (ex.: "Faltam para o nosso sim"). */
  title: string;
  /** Mensagem no dia do casamento, depois do horário. */
  todayMessage: string;
  /** Mensagem a partir do dia seguinte. */
  afterMessage: string;
  /**
   * Relógio controlado (ms desde a época), para testes e prévias. Sem ele, o
   * componente usa o relógio do aparelho e atualiza a cada virada de segundo.
   */
  now?: number;
  className?: string;
};

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
 * Contagem regressiva do hero, na faixa marinho com fio claro: dias, horas,
 * minutos e segundos. O servidor manda um esqueleto do mesmo tamanho (sem
 * pulo de layout); o cliente preenche após a hidratação.
 */
export function Countdown({
  target,
  title,
  todayMessage,
  afterMessage,
  now,
  className,
}: CountdownProps) {
  const phase = useClock((ms) => countdownPhase(ms, target), now);
  const ready = phase === "counting";

  return (
    <div className={cx(styles.box, className)} data-countdown="">
      <div className={styles.top} aria-hidden="true">
        <i />
        {title}
        <i />
      </div>
      {phase === "today" || phase === "after" ? (
        <p className={styles.message}>{phase === "today" ? todayMessage : afterMessage}</p>
      ) : (
        <>
          {ready ? <SpokenCountdown target={target} now={now} /> : null}
          <div
            className={cx(styles.grid, ready ? "animate-fade-in" : "opacity-0")}
            aria-hidden="true"
          >
            {COUNTDOWN_UNITS.map((unit) => (
              // A chave muda quando fica pronto: os dígitos nascem com o valor certo em vez de
              // rolar a partir do esqueleto "000" (no 1º segundo, todos rolavam juntos e os
              // números pareciam embaralhados).
              <UnitView
                key={`${unit}-${ready}`}
                unit={unit}
                target={target}
                now={now}
                ready={ready}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Frase do leitor de tela (minuto a minuto, sem os segundos). */
function SpokenCountdown({ target, now }: { target: string; now?: number }) {
  const text = useClock((ms) => describeCountdown(diffParts(ms, target)), now);
  return (
    <p className="sr-only" role="timer">
      {text}
    </p>
  );
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
  const text = value === null || !ready ? (unit === "days" ? "000" : "00") : pad2(value);
  return (
    <div className={cx(styles.unit, unit === "seconds" && styles.seconds)} data-unit={unit}>
      <span className={styles.num}>
        {text.split("").map((digit, i) => (
          // A chave conta da direita: as unidades ficam estáveis quando o
          // número perde um dígito (100 → 99).
          <RollingDigit key={text.length - i} digit={digit} />
        ))}
      </span>
      <span className={styles.label}>{unitLabel(unit, value ?? 0)}</span>
    </div>
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
