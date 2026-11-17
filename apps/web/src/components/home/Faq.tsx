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
              <li key={item.question} className="border-t border-line-soft last:border-b">
                <h3 className="font-normal">
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? null : i)}
                    className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-[18px] px-1 py-[22px] text-left text-[clamp(1.25rem,2.4vw,1.5rem)] leading-snug text-ink"
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
                      <p className="max-w-[680px] px-1 pb-6 text-ink-soft">{item.answer}</p>
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

/** O mais gira 45° e vira um x. */
function PlusIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cx(
        "size-[26px] shrink-0 text-ink transition-[rotate] duration-ui ease-out",
        open && "rotate-45",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
