/**
 * GSAP sob demanda (docs/PROMPT.md §4.6.6): só `import()` dinâmico, para o
 * GSAP ficar fora do bundle inicial da home. Não importe "gsap" nem
 * "@gsap/react" estaticamente em componentes da home (o @gsap/react importa
 * o gsap no topo do módulo e o puxaria para o bundle).
 */

export async function loadGsapScene() {
  const [{ gsap }, { SplitText }, { DrawSVGPlugin }] = await Promise.all([
    import("gsap"),
    import("gsap/SplitText"),
    import("gsap/DrawSVGPlugin"),
  ]);
  gsap.registerPlugin(SplitText, DrawSVGPlugin);
  return { gsap, SplitText };
}

export async function loadGsapScroll() {
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollTrigger"),
  ]);
  gsap.registerPlugin(ScrollTrigger);
  return { gsap, ScrollTrigger };
}

export type GsapScene = Awaited<ReturnType<typeof loadGsapScene>>;
