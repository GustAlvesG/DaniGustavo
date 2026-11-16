"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";

export const NAV_ITEMS = [
  { href: "/#casamento", label: "O casamento" },
  { href: "/padrinhos", label: "Padrinhos" },
  { href: "/galeria", label: "Galeria" },
] as const;

/**
 * Links do menu. Ilha cliente só para saber a rota atual (`usePathname`) e
 * marcar `aria-current`; o resto do cabeçalho é Server Component.
 */
export function NavLinks({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <ul className={cx("flex flex-wrap items-center gap-x-5 gap-y-1 sm:gap-x-9", className)}>
      {NAV_ITEMS.map((item) => {
        const current = item.href === pathname;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cx(
                "inline-flex min-h-11 items-center rounded-[1px] text-[0.9375rem] underline-offset-[0.35em] sm:text-base",
                "decoration-1 transition-[text-decoration-color] duration-micro ease-out",
                tone === "light"
                  ? "text-tinta decoration-transparent hover:decoration-cobalto aria-[current=page]:text-cobalto aria-[current=page]:underline aria-[current=page]:decoration-cobalto"
                  : "text-branco decoration-transparent hover:decoration-branco aria-[current=page]:underline aria-[current=page]:decoration-branco",
                "hover:underline",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
