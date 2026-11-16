"use client";

/**
 * Ilha cliente de "Nossa história": mede os marcos, desenha a linha e liga o
 * scroll. GSAP + ScrollTrigger chegam por `import()` só quando a seção se
 * aproxima da tela (fora do bundle inicial da home). Tudo o que o GSAP cria
 * fica num `gsap.matchMedia()` revertido ao desmontar (sem ScrollTrigger
 * vazando entre rotas). A Lenis (desktop) já avisa o ScrollTrigger a cada
 * quadro (SmoothScroll.tsx).
 */

import { useEffect, useRef } from "react";
import { loadGsapScroll } from "@/components/motion/load-gsap";
import { storyPath, type Point } from "@/lib/story-path";

type Mode = "horizontal" | "vertical" | "static";

/** Onde fica a "ponta da caneta" na tela (fração da largura/altura). */
const HEAD = 0.62;
const SAMPLES = 240;

export function StoryScroll() {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = anchor.current?.closest("section");
    const viewport = section?.querySelector<HTMLElement>("[data-story-viewport]");
    const track = section?.querySelector<HTMLElement>("[data-story-track]");
    const path = section?.querySelector<SVGPathElement>("[data-story-line]");
    if (!section || !viewport || !track || !path) return;

    let disposed = false;
    let revert: (() => void) | undefined;

    const start = async () => {
      const { gsap, ScrollTrigger } = await loadGsapScroll();
      if (disposed) return;

      // Amostras do caminho (comprimento → x, y) para achar quanto desenhar.
      let samples: { len: number; x: number; y: number }[] = [];
      let total = 1;
      let mode: Mode = "static";

      const measure = () => {
        const tr = track.getBoundingClientRect();
        const dots = Array.from(track.querySelectorAll<HTMLElement>("[data-story-dot]"));
        const pts: Point[] = dots.map((d) => {
          const r = d.getBoundingClientRect();
          return { x: r.left + r.width / 2 - tr.left, y: r.top + r.height / 2 - tr.top };
        });
        if (pts.length === 0) return;
        path.setAttribute(
          "d",
          storyPath(pts, mode === "horizontal" ? "horizontal" : "vertical", {
            width: tr.width,
            height: tr.height,
          }),
        );
        total = path.getTotalLength() || 1;
        samples = Array.from({ length: SAMPLES + 1 }, (_, i) => {
          const len = (total * i) / SAMPLES;
          const p = path.getPointAtLength(len);
          return { len, x: p.x, y: p.y };
        });
        track.dataset.line = "ready";
      };

      /** Desenha até a ponta da caneta (em coordenadas da trilha). */
      const draw = () => {
        if (mode === "static") {
          path.style.strokeDashoffset = "0";
          return;
        }
        const tr = track.getBoundingClientRect();
        const horizontal = mode === "horizontal";
        const head = horizontal
          ? window.innerWidth * HEAD - tr.left
          : window.innerHeight * HEAD - tr.top;
        let len = 0;
        for (const s of samples) {
          if ((horizontal ? s.x : s.y) <= head) len = s.len;
          else break;
        }
        path.style.strokeDashoffset = String(1 - len / total);
      };

      const mm = gsap.matchMedia();
      mm.add(
        {
          horizontal: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
          vertical: "(max-width: 1023.98px) and (prefers-reduced-motion: no-preference)",
          reduced: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const c = context.conditions ?? {};
          mode = c.horizontal ? "horizontal" : c.vertical ? "vertical" : "static";

          if (mode === "horizontal") {
            viewport.dataset.pinned = "";
            viewport.scrollLeft = 0;
            const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
            gsap.to(track, {
              x: () => -distance(),
              ease: "none",
              onUpdate: draw,
              scrollTrigger: {
                trigger: viewport,
                pin: true,
                start: "top top",
                end: () => `+=${distance()}`,
                scrub: true,
                invalidateOnRefresh: true,
                anticipatePin: 1,
                onRefresh: () => {
                  measure();
                  draw();
                },
              },
            });
          } else if (mode === "vertical") {
            ScrollTrigger.create({
              trigger: track,
              start: "top bottom",
              end: "bottom top",
              onUpdate: draw,
              onRefresh: () => {
                measure();
                draw();
              },
            });
          }

          measure();
          draw();
          const ro = new ResizeObserver(() => {
            if (mode === "static") {
              measure();
              draw();
            }
          });
          ro.observe(track);

          return () => {
            ro.disconnect();
            delete viewport.dataset.pinned;
            gsap.set(track, { clearProps: "transform" });
          };
        },
      );

      // Fontes trocam a medida do texto: recalcula pins e a linha.
      void document.fonts?.ready.then(() => {
        if (!disposed) ScrollTrigger.refresh();
      });

      revert = () => {
        mm.revert();
        delete track.dataset.line;
        path.removeAttribute("d");
        path.style.strokeDashoffset = "";
      };
    };

    // Carrega o GSAP só quando a seção está a uma tela de distância.
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void start();
      },
      { rootMargin: "100% 0px 100% 0px" },
    );
    io.observe(section);

    return () => {
      disposed = true;
      io.disconnect();
      revert?.();
    };
  }, []);

  return <span ref={anchor} hidden />;
}
