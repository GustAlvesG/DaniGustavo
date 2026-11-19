import { SiteFooter } from "@/components/site/SiteFooter";
import { getSite } from "@/lib/api/site";

/**
 * Layout das páginas públicas (o grupo "(site)" não entra na URL). O rodapé
 * mora aqui, então persiste entre as páginas; o conteúdo vem do cache de
 * `/api/site` (pré-renderizado, refeito a cada 60 s).
 */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const site = await getSite();
  return (
    <>
      {children}
      <SiteFooter site={site} />
    </>
  );
}
