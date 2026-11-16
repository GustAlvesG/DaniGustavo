"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** Evento que repete a virada de uma faixa já montada: `el.dispatchEvent(new Event(TILE_BAND_REPLAY))`. */
export const TILE_BAND_REPLAY = "tileband:replay";

interface TileBandFlipProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  replayKey?: string | number;
  "data-count"?: number;
  "data-joint"?: "none";
  "aria-hidden"?: boolean;
}

/**
 * Ilha cliente da faixa: observa a entrada na tela e troca `data-flip`
 * (sem atributo → "go" → "done"). O verso inicial vem do CSS
 * (`@media (scripting: enabled)`), então não há flash antes da hidratação.
 */
export function TileBandFlip({ children, replayKey, ...rest }: TileBandFlipProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let io: IntersectionObserver | undefined;
    let timer: number | undefined;
    let first = true;

    const finish = () => {
      el.dataset.flip = "done";
      delete el.dataset.quick;
    };

    const go = (quick: boolean) => {
      if (quick) el.dataset.quick = "";
      el.dataset.flip = "go";
      // Quantos ladrilhos estão na primeira linha (os outros ficam ocultos).
      const cells = Array.from(el.children) as HTMLElement[];
      const top = cells[0]?.offsetTop ?? 0;
      const visible = Math.max(1, cells.filter((c) => c.offsetTop === top).length);
      const step = quick ? 45 : 70;
      const duration = quick ? 520 : 600;
      timer = window.setTimeout(finish, duration + step * (visible - 1) + 80);
    };

    const start = () => {
      io?.disconnect();
      window.clearTimeout(timer);
      // Volta ao verso sem transição e força o estilo antes de observar.
      delete el.dataset.flip;
      delete el.dataset.quick;
      void el.offsetWidth;
      if (typeof IntersectionObserver === "undefined") {
        finish();
        return;
      }
      first = true;
      io = new IntersectionObserver(
        (entries) => {
          const hit = entries.some((e) => e.isIntersecting);
          const quick = first;
          first = false;
          if (!hit) return;
          io?.disconnect();
          go(quick);
        },
        { threshold: 0.4, rootMargin: "0px 0px -6% 0px" },
      );
      io.observe(el);
    };

    start();
    el.addEventListener(TILE_BAND_REPLAY, start);
    return () => {
      io?.disconnect();
      window.clearTimeout(timer);
      el.removeEventListener(TILE_BAND_REPLAY, start);
    };
  }, [replayKey]);

  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}
