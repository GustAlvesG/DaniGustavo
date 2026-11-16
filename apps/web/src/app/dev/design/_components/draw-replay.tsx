"use client";

import { useRef } from "react";
import { Monogram, Tile } from "@/components/tiles";
import { Button } from "@/components/ui";
import { Caption } from "./section";

/**
 * Desenho por traço: os SVGs nascem desenhados (`drawn`). O replay troca
 * `data-drawn` para "false" (traços somem sem transição), força o estilo e
 * volta para "true", que anima o stroke-dashoffset na ordem dos paths.
 */
export function DrawReplay() {
  const root = useRef<HTMLDivElement>(null);
  const replay = () => {
    const el = root.current;
    if (!el) return;
    const svgs = el.querySelectorAll<SVGSVGElement>("svg[data-drawn]");
    svgs.forEach((svg) => svg.setAttribute("data-drawn", "false"));
    void el.offsetWidth;
    svgs.forEach((svg) => svg.setAttribute("data-drawn", "true"));
  };
  return (
    <div className="flex flex-col gap-8">
      <div
        ref={root}
        className="grid grid-cols-2 items-end gap-x-6 gap-y-8 lg:grid-cols-12 lg:gap-x-8"
      >
        <figure className="flex flex-col gap-3 lg:col-span-3">
          <Tile design="flor" drawn />
          <Caption>Flor</Caption>
        </figure>
        <figure className="flex flex-col gap-3 lg:col-span-3">
          <Tile design="moldura" drawn />
          <Caption>Moldura</Caption>
        </figure>
        <figure className="col-span-2 flex flex-col gap-3 lg:col-span-6">
          <div className="grid aspect-[2/1] place-items-center bg-nevoa px-8">
            <Monogram drawn weight={1.3} className="max-w-[360px]" />
          </div>
          <Caption>Monograma D & G</Caption>
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
