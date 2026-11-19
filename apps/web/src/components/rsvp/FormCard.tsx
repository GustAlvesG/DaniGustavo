import type { ReactNode } from "react";
import { Monograma } from "@/components/brand";
import { getContent } from "@/lib/api/site";
import { cx } from "@/lib/cx";

/**
 * Cartão dos formulários de RSVP: o "cartão-resposta" do álbum (papel com
 * fio a 9px da borda e sombra de papel), com o DG no topo. Os formulários
 * ficam no claro: campos brancos, texto marinho, erro escuro.
 */
export async function FormCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { iniciais } = await getContent();
  return (
    <div
      className={cx(
        "cartao-resp surface-papel relative px-6! pt-10! pb-10! sm:px-10! lg:px-12!",
        className,
      )}
    >
      <Monograma iniciais={iniciais} bold={10} className="mx-auto mb-8 w-16 text-ink sm:w-20" />
      {children}
    </div>
  );
}
