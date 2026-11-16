"use client";

import { useRef, type CSSProperties } from "react";
import { Button } from "@/components/ui";
import styles from "./board.module.css";

type Curve = {
  token: string;
  value: string;
  points: [number, number, number, number];
  usage: string;
};

const CURVES: Curve[] = [
  {
    token: "--ease-out",
    value: "cubic-bezier(0.22, 1, 0.36, 1)",
    points: [0.22, 1, 0.36, 1],
    usage: "Entradas e respostas ao toque: sai rápido e assenta devagar.",
  },
  {
    token: "--ease-in-out",
    value: "cubic-bezier(0.65, 0, 0.35, 1)",
    points: [0.65, 0, 0.35, 1],
    usage: "Movimentos de cena e traços que se desenham: acelera e freia.",
  },
];

const DURATIONS = [
  { token: "--duration-micro", ms: 160, usage: "Hover, pressão do botão, troca de cor." },
  { token: "--duration-ui", ms: 320, usage: "Componentes: dígito que rola, rádio, visto." },
  { token: "--duration-scene", ms: 720, usage: "Cenas: virada de faixa, abertura, etapas." },
];

const SCALE_MAX = 1000;
const DEMO_MS = 900;

/** Volta todos os marcadores ao início sem transição e solta de novo. */
function useReplay() {
  const root = useRef<HTMLDivElement>(null);
  const replay = () => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-at]");
    items.forEach((item) => (item.dataset.at = "start"));
    void el.offsetWidth;
    items.forEach((item) => (item.dataset.at = "end"));
  };
  return { root, replay };
}

/** Gráfico da curva: progresso (vertical) pelo tempo (horizontal). */
function CurvePlot({ points, title }: { points: Curve["points"]; title: string }) {
  const [x1, y1, x2, y2] = points;
  const S = 100;
  const px = (x: number) => 12 + x * S;
  const py = (y: number) => 112 - y * S;
  return (
    <svg viewBox="0 0 124 124" className="w-full" role="img" aria-label={title}>
      <rect x={px(0)} y={py(1)} width={S} height={S} fill="var(--color-branco)" />
      {[0.25, 0.5, 0.75].map((t) => (
        <g key={t} stroke="var(--color-nevoa)" strokeWidth="0.6">
          <line x1={px(t)} y1={py(0)} x2={px(t)} y2={py(1)} />
          <line x1={px(0)} y1={py(t)} x2={px(1)} y2={py(t)} />
        </g>
      ))}
      <rect
        x={px(0)}
        y={py(1)}
        width={S}
        height={S}
        fill="none"
        stroke="var(--color-cobalto)"
        strokeOpacity="0.3"
        strokeWidth="0.6"
      />
      <line
        x1={px(0)}
        y1={py(0)}
        x2={px(1)}
        y2={py(1)}
        stroke="var(--color-anil)"
        strokeOpacity="0.35"
        strokeWidth="0.6"
      />
      <g stroke="var(--color-anil)" strokeWidth="0.7">
        <line x1={px(0)} y1={py(0)} x2={px(x1)} y2={py(y1)} />
        <line x1={px(1)} y1={py(1)} x2={px(x2)} y2={py(y2)} />
      </g>
      <path
        d={`M${px(0)} ${py(0)} C${px(x1)} ${py(y1)} ${px(x2)} ${py(y2)} ${px(1)} ${py(1)}`}
        fill="none"
        stroke="var(--color-cobalto)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g fill="var(--color-branco)" stroke="var(--color-anil)" strokeWidth="0.9">
        <circle cx={px(x1)} cy={py(y1)} r="2.2" />
        <circle cx={px(x2)} cy={py(y2)} r="2.2" />
      </g>
      <g fill="var(--color-cobalto)">
        <circle cx={px(0)} cy={py(0)} r="1.8" />
        <circle cx={px(1)} cy={py(1)} r="1.8" />
      </g>
    </svg>
  );
}

function Runner({ duration, ease }: { duration: number; ease: string }) {
  return (
    <div className={styles.track}>
      <div
        data-at="end"
        className={styles.runner}
        style={{ "--run-duration": `${duration}ms`, "--run-ease": ease } as CSSProperties}
      >
        <span className={styles.runnerMark} />
      </div>
    </div>
  );
}

export function CurvesBoard() {
  const { root, replay } = useReplay();
  return (
    <div ref={root} className="flex flex-col gap-10">
      <div className="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2">
        {CURVES.map((c) => (
          <figure key={c.token} className="flex flex-col">
            <div className="max-w-[22rem]">
              <CurvePlot points={c.points} title={`Gráfico da curva ${c.token}`} />
            </div>
            <figcaption className="mt-5 flex flex-col gap-1">
              <code className="font-mono text-sm text-cobalto">{c.token}</code>
              <span className="text-sm tabular-nums text-tinta/75">{c.value}</span>
              <span className="mt-1 max-w-[40ch] text-base text-tinta/85">{c.usage}</span>
            </figcaption>
            <div className="mt-6 flex flex-col gap-2">
              <Runner duration={DEMO_MS} ease={`var(${c.token})`} />
              <p className="text-xs text-tinta/65">{DEMO_MS} ms com esta curva</p>
            </div>
          </figure>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Runner duration={DEMO_MS} ease="linear" />
        <p className="text-xs text-tinta/65">Referência linear, {DEMO_MS} ms</p>
      </div>
      <div>
        <Button variant="secondary" onClick={replay}>
          Repetir curvas
        </Button>
      </div>
    </div>
  );
}

export function DurationsBoard() {
  const { root, replay } = useReplay();
  return (
    <div ref={root} className="flex flex-col gap-10">
      <ul className="flex flex-col">
        {DURATIONS.map((d) => (
          <li
            key={d.token}
            className="grid grid-cols-1 gap-x-8 gap-y-4 border-t border-nevoa py-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl tabular-nums text-tinta">{d.ms}</span>
                <span className="text-sm text-tinta/75">ms</span>
              </div>
              <code className="font-mono text-sm text-cobalto">{d.token}</code>
              <span className="text-sm text-tinta/80">{d.usage}</span>
            </div>
            <div className="flex flex-col justify-center gap-4">
              <div className="relative h-2 bg-nevoa">
                <div
                  data-at="end"
                  className={styles.bar}
                  style={
                    {
                      width: `${(d.ms / SCALE_MAX) * 100}%`,
                      "--run-duration": `${d.ms}ms`,
                    } as CSSProperties
                  }
                />
              </div>
              <Runner duration={d.ms} ease="var(--ease-out)" />
            </div>
          </li>
        ))}
      </ul>
      <p className="-mt-6 text-xs text-tinta/65">
        Barras na escala de 0 a 1 s. O quadrado percorre o trilho no tempo do token, com --ease-out.
      </p>
      <div>
        <Button variant="secondary" onClick={replay}>
          Repetir durações
        </Button>
      </div>
    </div>
  );
}
