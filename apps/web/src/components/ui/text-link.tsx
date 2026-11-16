import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

export type TextLinkProps = ComponentProps<typeof Link>;

/**
 * Link no meio do texto: cobalto, sublinhado afastado da linha de base que
 * engrossa no hover (sem mudar de cor, sem seta).
 */
export function TextLink({ className, ...rest }: TextLinkProps) {
  return (
    <Link
      {...rest}
      className={cx(
        "rounded-[1px] text-cobalto underline decoration-from-font decoration-cobalto/60 underline-offset-[0.22em]",
        "transition-[text-decoration-color,text-decoration-thickness] duration-micro ease-out",
        "hover:decoration-cobalto hover:decoration-2",
        className,
      )}
    />
  );
}
