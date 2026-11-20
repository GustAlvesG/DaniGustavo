"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { NavItem } from "./nav-items";
import styles from "./nav.module.css";

/**
 * Menu do celular (até 960px): botão redondo que abre a lista sob o menu.
 * Fecha ao escolher um link ou com Esc.
 */
export function MobileMenu({ items, cta }: { items: NavItem[]; cta: NavItem | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <nav id={panelId} className={styles.mobilePanel} aria-label="Menu" hidden={!open}>
        {items.map((item) => (
          <Link key={item.href} href={item.href} onClick={close}>
            {item.label}
          </Link>
        ))}
        {cta ? (
          <Link className={styles.mobileCta} data-cta="" href={cta.href} onClick={close}>
            {cta.label}
          </Link>
        ) : null}
      </nav>
    </>
  );
}
