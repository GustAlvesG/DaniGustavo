"use client";

/**
 * Abertura da home (docs/PROMPT.md §4.6.1) — a assinatura do site.
 *
 * COMO A ABERTURA NÃO ATRASA O LCP
 * 1. O hero é Server Component, vem no HTML estático com opacidade 1 e sem
 *    transform: o h1 "Dani & Gustavo" é o elemento LCP e é pintado no
 *    primeiro paint, por baixo da capa. O LCP do Chrome não testa oclusão
 *    (texto coberto conta); só opacidade 0 / visibility exclui — e o hero
 *    nunca fica assim antes de pintado.
 * 2. A capa é esta mesma marcação, renderizada no servidor e escondida por
 *    CSS. Um script bloqueante minúsculo no <head> (layout.tsx,
 *    `openingInlineScript`) põe `<html data-opening="pending">` antes do
 *    primeiro paint — só na home, só se a sessão não viu, sem depender de
 *    React. O CSS então mostra a capa já no primeiro paint: sem flash do
 *    hero e sem salto, porque o primeiro quadro animado é o mesmo DOM.
 * 3. A capa não tem texto nem imagem raster (só divs e SVG com <use>), logo
 *    não disputa o LCP. Sem JS, o atributo nunca é posto: nenhuma capa.
 * 4. Depois da hidratação, `import()` dinâmico de gsap + SplitText +
 *    DrawSVGPlugin (fora do bundle inicial). O SplitText só divide os nomes
 *    depois do LCP e enquanto a capa os cobre; no fim, `revert()` devolve o
 *    texto original (leitores de tela, seleção).
 * 5. Rede lenta ou erro: sem GSAP em 2,5 s, a capa sai com fade. Sem
 *    hidratação nenhuma, o próprio script inline tira o atributo em 6 s.
 *
 * Toque, clique, roda do mouse ou qualquer tecla pulam para o fim.
 */

import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from "react";
import { Monogram } from "@/components/tiles";
import { TileSymbols, TileUse, symbolId, useSymbolPrefix } from "@/components/tiles/TileSymbols";
import { loadGsapScene, type GsapScene } from "@/components/motion/load-gsap";
import { cx } from "@/lib/cx";
import {
  OPENING_ATTR,
  OPENING_STORAGE_KEY,
  OPENING_TIMELINE as T,
  openingCells,
  waveDelays,
} from "@/lib/opening";
import { rotationFor } from "@/lib/tiles";
import styles from "./opening.module.css";

const DESIGN = "flor" as const;
const CELLS = openingCells();

/* Estado "capa pendente" compartilhado: posto pelo script inline. */
type OpeningWindow = Window & { __dgOpening?: number };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getPending = () => (window as OpeningWindow).__dgOpening === 1;
// No servidor a capa sempre vai no HTML (escondida por CSS).
const getServerPending = () => true;

function endPending() {
  delete (window as OpeningWindow).__dgOpening;
  document.documentElement.removeAttribute(OPENING_ATTR);
  listeners.forEach((fn) => fn());
}

export interface OpeningProps {
  /** Replay da /dev/design: roda sem olhar nem gravar o sessionStorage. */
  forced?: boolean;
  onDone?: () => void;
}

export function Opening({ forced = false, onDone }: OpeningProps) {
  const pending = useSyncExternalStore(subscribe, getPending, getServerPending);
  const active = forced || pending;
  const rootRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const prefix = useSymbolPrefix();

  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root) return;
    const html = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (forced) {
      root.dataset.active = "";
    } else {
      // "running" desliga o failsafe do script inline e repõe o atributo se
      // o React o tirou (remontagem do Strict Mode em desenvolvimento).
      html.setAttribute(OPENING_ATTR, "running");
      try {
        sessionStorage.setItem(OPENING_STORAGE_KEY, "1");
      } catch {
        /* sessão sem storage: a abertura pode repetir, sem problema */
      }
    }

    let done = false;
    let cancelled = false;
    const timers: number[] = [];
    let scene: { gsap: GsapScene["gsap"]; ctx: gsap.Context; split?: SplitText } | undefined;

    const cleanupScene = () => {
      scene?.split?.revert();
      scene?.ctx.revert();
      scene = undefined;
    };

    const finish = () => {
      if (done) return;
      done = true;
      removeSkip();
      timers.forEach((t) => window.clearTimeout(t));
      cleanupScene();
      if (forced) onDoneRef.current?.();
      else endPending();
    };

    const fadeOut = () => {
      if (done) return;
      root.dataset.leaving = "";
      timers.push(window.setTimeout(finish, T.fade.duration * 1000 + 40));
    };

    const skipEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    const onSkip = () => finish();
    const removeSkip = () =>
      skipEvents.forEach((e) => window.removeEventListener(e, onSkip, { capture: true }));
    skipEvents.forEach((e) => window.addEventListener(e, onSkip, { capture: true, passive: true }));

    if (reduced) {
      // Movimento reduzido: a capa (face + monograma prontos) some em 200 ms.
      const hold = forced ? 400 : Math.max(0, 700 - performance.now());
      timers.push(window.setTimeout(fadeOut, hold));
    } else {
      timers.push(window.setTimeout(fadeOut, T.loadTimeout * 1000));
      loadGsapScene()
        .then(({ gsap, SplitText }) => {
          if (cancelled || done || root.dataset.leaving !== undefined) return;
          timers.forEach((t) => window.clearTimeout(t));
          timers.length = 0;
          scene = { gsap, ctx: gsap.context(() => {}, root) };
          const current = scene;
          current.ctx.add(() => {
            current.split = play(gsap, SplitText, root, finish);
          });
        })
        .catch(fadeOut);
    }

    return () => {
      cancelled = true;
      removeSkip();
      timers.forEach((t) => window.clearTimeout(t));
      cleanupScene();
      delete root.dataset.leaving;
      delete root.dataset.drawing;
      root.querySelectorAll<HTMLElement>("[data-front], [data-off]").forEach((el) => {
        delete el.dataset.front;
        delete el.dataset.off;
      });
    };
  }, [active, forced]);

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      aria-hidden="true"
      data-motion="keep"
      data-opening-root=""
    >
      <TileSymbols prefix={prefix} designs={[DESIGN]} />
      {(["l", "r"] as const).map((door) => (
        <div key={door} className={styles.door} data-door={door}>
          {CELLS.filter((c) => c.door === door).map((c) => (
            <div
              key={`${c.k}:${c.j}`}
              className={styles.cell}
              data-cell=""
              data-k={c.k}
              data-j={c.j}
              style={{ "--k": c.k, "--j": c.j } as CSSProperties}
            >
              <div className={styles.card}>
                <div className={styles.back} />
                {c.field ? (
                  <div className={cx(styles.face, styles.blank)} />
                ) : (
                  <div className={styles.face}>
                    <TileUse
                      href={symbolId(prefix, DESIGN)}
                      rotate={rotationFor("roseta", c.col, c.j)}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className={styles.frame} data-frame={door} />
          <div className={cx(styles.mono, styles.monoSm)}>
            <Monogram weight={1.7} />
          </div>
          <div className={cx(styles.mono, styles.monoLg)}>
            <Monogram weight={1.05} />
          </div>
        </div>
      ))}
    </div>
  );
}

const visible = (el: Element) => el.getClientRects().length > 0;

/** Monta e toca a timeline. Retorna o SplitText (revertido no fim). */
function play(
  gsap: GsapScene["gsap"],
  SplitTextClass: GsapScene["SplitText"],
  root: HTMLElement,
  onComplete: () => void,
): SplitText | undefined {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Só os ladrilhos na tela animam (≤ 120); os de fora saem do layout.
  const all = Array.from(root.querySelectorAll<HTMLElement>("[data-cell]")).filter(visible);
  const cells = all.filter((el) => {
    const r = el.getBoundingClientRect();
    const on = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
    if (!on) el.dataset.off = "";
    return on;
  });
  const cards = cells.map((el) => el.firstElementChild as HTMLElement);
  const delays = waveDelays(
    cells.map((el) => ({
      door: el.closest<HTMLElement>("[data-door]")?.dataset.door === "l" ? "l" : "r",
      k: Number(el.dataset.k),
      j: Number(el.dataset.j),
    })),
    T.flip.spread,
  );

  // Traços dos monogramas visíveis, intercalados (esq., dir.) por ordem de escrita.
  const monos = Array.from(root.querySelectorAll<SVGSVGElement>("svg")).filter(
    (svg) => svg.closest(`.${styles.mono}`) && visible(svg),
  );
  const strokeLists = monos.map((svg) => Array.from(svg.querySelectorAll("path")));
  const strokes: SVGPathElement[] = [];
  for (let i = 0; i < (strokeLists[0]?.length ?? 0); i++) {
    strokeLists.forEach((list) => list[i] && strokes.push(list[i]));
  }
  const perStroke = Math.max(1, strokeLists.length);

  const doors = Array.from(root.querySelectorAll<HTMLElement>("[data-door]"));
  const [left, right] = doors;

  // Nomes do hero (se houver na página): divididos agora, cobertos pela capa.
  const lines = Array.from(document.querySelectorAll<HTMLElement>("[data-hero-line]"));
  const split = lines.length
    ? SplitTextClass.create(lines, { type: "chars", mask: "chars", charsClass: "hero-char" })
    : undefined;

  gsap.set(strokes, { drawSVG: 0 });
  root.dataset.drawing = "";
  if (split) gsap.set(split.chars, { yPercent: 135, willChange: "transform" });
  const frames = Array.from(root.querySelectorAll<HTMLElement>("[data-frame]"));
  frames.forEach((el) =>
    gsap.set(el, {
      clipPath: el.dataset.frame === "l" ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)",
    }),
  );
  gsap.set(doors, { willChange: "transform, opacity", force3D: true });
  // Monograma e cartela em camadas próprias: o traço que muda a cada quadro
  // repinta só a camada deles, não a folha inteira.
  gsap.set([...monos.map((svg) => svg.parentElement), ...frames], { willChange: "transform" });

  const tl = gsap.timeline({ onComplete });
  if (process.env.NODE_ENV !== "production") {
    // Revisão quadro a quadro (scripts de screenshot): window.__dgOpeningTimeline.seek(1.2)
    (window as Window & { __dgOpeningTimeline?: gsap.core.Timeline }).__dgOpeningTimeline = tl;
  }

  // a) onda de viradas a partir do centro: verso até ficar de lado (90°),
  // troca para a face e volta de -90° a 0°. Uma camada por ladrilho só
  // enquanto gira.
  const half = T.flip.duration / 2;
  cards.forEach((card, i) => {
    const flip = gsap.timeline();
    flip
      .to(card, { rotationY: 90, transformPerspective: 600, duration: half, ease: "power2.in" })
      .call(() => {
        card.dataset.front = "";
      })
      .fromTo(
        card,
        { rotationY: -90 },
        { rotationY: 0, duration: half, ease: "power2.out", immediateRender: false },
      )
      .set(card, { clearProps: "transform" });
    tl.add(flip, T.flip.start + (delays[i] ?? 0));
  });

  // b) monograma desenhado em cobalto
  tl.to(
    strokes,
    {
      drawSVG: "100%",
      duration: T.draw.duration,
      ease: "power1.inOut",
      stagger: (i: number) => Math.floor(i / perStroke) * T.draw.stagger,
    },
    T.draw.start,
  );

  // cartela: o filete corre da junta para as pontas enquanto o monograma se escreve
  tl.to(
    frames,
    { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "power2.inOut" },
    T.draw.start + 0.1,
  );

  // c) folhas de porta abrem pelas dobradiças das bordas (para dentro da cena)
  const doorVars = { duration: T.doors.duration, ease: "power3.inOut" };
  if (left) tl.to(left, { rotationY: 84, xPercent: -6, ...doorVars }, T.doors.start);
  if (right) tl.to(right, { rotationY: -84, xPercent: 6, ...doorVars }, T.doors.start);
  tl.to(
    doors,
    { opacity: 0, duration: 0.32, ease: "power1.in" },
    T.doors.start + T.doors.duration - 0.32,
  );

  // d) nomes sobem por máscara, letra a letra
  if (split) {
    tl.to(
      split.chars,
      {
        yPercent: 0,
        duration: T.names.duration,
        ease: "expo.out",
        stagger: T.names.stagger,
      },
      T.names.start,
    );
  }

  return split;
}
