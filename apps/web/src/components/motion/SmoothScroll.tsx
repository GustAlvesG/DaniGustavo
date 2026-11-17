"use client";

/**
 * Rolagem suave com Lenis (docs/PROMPT.md §3, §4.6): só desktop com mouse
 * (`(min-width:1024px) and (pointer:fine)`), desligada com movimento
 * reduzido. O Lenis chega por `import()` dinâmico, fora do bundle inicial,
 * e roda o próprio laço de quadros (`autoRaf`). A rolagem continua nativa por
 * baixo: as animações por rolagem do CSS (`animation-timeline`) seguem iguais.
 *
 * Montado uma vez no layout raiz. A Fase 2 usa `getLenis()` (ex.: âncoras).
 */

import "lenis/dist/lenis.css";
import { useEffect } from "react";
import type Lenis from "lenis";

const QUERY = "(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

let instance: Lenis | null = null;

/** A instância ativa, ou null (celular, movimento reduzido, ainda carregando). */
export function getLenis(): Lenis | null {
  return instance;
}

export function SmoothScroll() {
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    let stopAll: (() => void) | undefined;
    let disposed = false;

    const start = async () => {
      if (stopAll || !media.matches) return;
      const { default: LenisClass } = await import("lenis");
      if (disposed || stopAll || !media.matches) return;

      const lenis = new LenisClass({ autoRaf: true });

      instance = lenis;
      stopAll = () => {
        lenis.destroy();
        if (instance === lenis) instance = null;
        stopAll = undefined;
      };
    };

    const onChange = () => {
      if (media.matches) void start();
      else stopAll?.();
    };

    void start();
    media.addEventListener("change", onChange);
    return () => {
      disposed = true;
      media.removeEventListener("change", onChange);
      stopAll?.();
    };
  }, []);

  return null;
}
