"use client";

/**
 * Rolagem suave com Lenis (docs/PROMPT.md §3, §4.6): só desktop com mouse
 * (`(min-width:1024px) and (pointer:fine)`), desligada com movimento
 * reduzido. Lenis, GSAP e ScrollTrigger chegam por `import()` dinâmico,
 * fora do bundle inicial. Enquanto a abertura cobre a página
 * (`<html data-opening>`), a rolagem fica parada.
 *
 * Montado uma vez no layout raiz. A Fase 2 usa `getLenis()` (ex.: âncoras).
 */

import "lenis/dist/lenis.css";
import { useEffect } from "react";
import type Lenis from "lenis";
import { loadGsapScroll } from "./load-gsap";
import { OPENING_ATTR } from "@/lib/opening";

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
      const [{ default: LenisClass }, { gsap, ScrollTrigger }] = await Promise.all([
        import("lenis"),
        loadGsapScroll(),
      ]);
      if (disposed || stopAll || !media.matches) return;

      const lenis = new LenisClass();
      const tick = (time: number) => lenis.raf(time * 1000);
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      const html = document.documentElement;
      const sync = () => (html.hasAttribute(OPENING_ATTR) ? lenis.stop() : lenis.start());
      sync();
      const observer = new MutationObserver(sync);
      observer.observe(html, { attributes: true, attributeFilter: [OPENING_ATTR] });

      instance = lenis;
      stopAll = () => {
        observer.disconnect();
        gsap.ticker.remove(tick);
        gsap.ticker.lagSmoothing(500, 33);
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
