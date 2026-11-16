"use client";

import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { useId, useState } from "react";
import type { FaqItem } from "@casamento/shared";
import { cx } from "@/lib/cx";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Acordeão acessível (padrão WAI-ARIA: botão com aria-expanded e
 * aria-controls, painel com role="region"). Motion anima altura e opacidade;
 * `LazyMotion` + `m` carrega só o pacote de animação de DOM. Com movimento
 * reduzido, `MotionConfig reducedMotion="user"` corta o movimento.
 */
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <ul className="flex flex-col">
          {items.map((item, i) => {
            const expanded = open === i;
            const buttonId = `${baseId}-q${i}`;
            const panelId = `${baseId}-a${i}`;
            return (
              <li key={item.question} className="border-t border-cobalto/20 last:border-b">
                <h3>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? null : i)}
                    className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-6 py-4 text-left text-lg font-medium text-tinta"
                  >
                    {item.question}
                    <PlusIcon open={expanded} />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <m.div
                      key="painel"
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-[60ch] pb-6 text-base text-tinta/85">{item.answer}</p>
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </MotionConfig>
    </LazyMotion>
  );
}

/** Mais que vira menos: a haste vertical gira até deitar. */
function PlusIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5 shrink-0 text-cobalto"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 10h14" />
      <path
        d="M10 3v14"
        className={cx(
          "origin-center transition-transform duration-ui ease-out",
          open && "rotate-90",
        )}
      />
    </svg>
  );
}
