"use client";

import { useRef } from "react";
import { MonogramDG } from "@/components/brand";
import { loadGsapScene } from "@/components/motion/load-gsap";
import { Tile } from "@/components/tiles";
import { Button } from "@/components/ui";
import { Caption } from "./section";

/**
 * Desenho por traço. Ladrilhos: os SVGs nascem desenhados (`drawn`); o
 * replay troca `data-drawn` para "false" e volta para "true" (CSS). DG: a
 * mesma cena da abertura (DrawSVG na linha e na máscara da tinta, e no fim o
 * preenchimento estático), com o GSAP carregado só ao clicar.
 */
export function DrawReplay() {
  const root = useRef<HTMLDivElement>(null);
  const replay = async () => {
    const el = root.current;
    if (!el) return;
    const svgs = el.querySelectorAll<SVGSVGElement>("svg[data-drawn]");
    svgs.forEach((svg) => svg.setAttribute("data-drawn", "false"));
    void el.offsetWidth;
    svgs.forEach((svg) => svg.setAttribute("data-drawn", "true"));

    const mono = el.querySelector<SVGSVGElement>('svg[data-mono-variant="draw"]');
    if (!mono || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { gsap } = await loadGsapScene();
    mono.removeAttribute("data-resolved");
    const pens = Array.from(mono.querySelectorAll("[data-mono-line]"));
    const masks = Array.from(mono.querySelectorAll("[data-mono-mask]"));
    gsap.set([...pens, ...masks], { drawSVG: 0 });
    const tl = gsap.timeline({ onComplete: () => mono.setAttribute("data-resolved", "") });
    pens.forEach((pen, i) => {
      tl.to(pen, { drawSVG: "100%", duration: 0.42, ease: "power1.inOut" }, i * 0.17);
      const mask = masks[i];
      if (mask) {
        tl.to(mask, { drawSVG: "100%", duration: 0.42, ease: "power1.inOut" }, i * 0.17 + 0.1);
      }
    });
  };
  return (
    <div className="flex flex-col gap-8">
      <div
        ref={root}
        className="grid grid-cols-2 items-end gap-x-6 gap-y-8 lg:grid-cols-12 lg:gap-x-8"
      >
        <figure className="flex flex-col gap-3 lg:col-span-3">
          <Tile design="rosa" drawn />
          <Caption>Rosa</Caption>
        </figure>
        <figure className="flex flex-col gap-3 lg:col-span-3">
          <Tile design="monograma" drawn />
          <Caption>Monograma</Caption>
        </figure>
        <figure className="col-span-2 flex flex-col gap-3 lg:col-span-6">
          <div className="grid aspect-[2/1] place-items-center rounded-full border border-line-soft px-12">
            <MonogramDG variant="draw" className="max-w-[340px]" />
          </div>
          <Caption>DG: a linha corre, a tinta vem atrás, e resolve no preenchido</Caption>
        </figure>
      </div>
      <div>
        <Button variant="secondary" onClick={replay}>
          Repetir desenho
        </Button>
      </div>
    </div>
  );
}
