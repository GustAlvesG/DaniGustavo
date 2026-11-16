import type { ReactNode } from "react";
import { MonogramDG } from "@/components/brand";
import { cx } from "@/lib/cx";

/**
 * Cartão claro dos formulários: o arco do manual do casal (campo relevo,
 * moldura royal, fio serenity por fora), com o DG na coroa do arco. Os
 * formulários ficam no claro: campos brancos, texto marinho, erro escuro.
 */
export function FormCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "surface-relevo card-relevo shape-arch relative px-6 pt-[7.25rem] pb-10 sm:px-10 sm:pt-[8.5rem] lg:px-12",
        "[--arch-foot:2rem] [--arch-rise:clamp(8rem,30vw,11rem)]",
        className,
      )}
    >
      <MonogramDG
        bold={9}
        className="absolute top-12 left-1/2 w-16 -translate-x-1/2 text-accent sm:top-14 sm:w-20"
      />
      {children}
    </div>
  );
}
