import Link from "next/link";
import type { SiteContent } from "@casamento/shared";
import { Monograma } from "@/components/brand";
import { getMonogram } from "@/lib/api/site";
import { cx } from "@/lib/cx";
import { formatDotDate } from "@/lib/site";
import { MobileMenu } from "./MobileMenu";
import { NavDate } from "./NavDate";
import { navCta, navItems } from "./nav-items";
import styles from "./nav.module.css";

export type SiteNavProps = {
  site: SiteContent;
  /**
   * "home": o menu começa transparente sobre a foto e ganha o fundo marinho
   * conforme o hero sai (animação guiada pela rolagem); a data só entra
   * depois que a do hero some. "pagina": marinho e com a data desde o início.
   */
  variant?: "home" | "pagina";
  /** Caminho da página atual (marca o link com aria-current). */
  current?: string;
};

/**
 * Menu do topo, fixo e sempre com a mesma altura (--nav-h, 72px): nada
 * encolhe ao rolar. Server Component; só a data e o menu do celular são
 * ilhas cliente.
 */
export async function SiteNav({ site, variant = "pagina", current }: SiteNavProps) {
  const iniciais = await getMonogram();
  const items = navItems(site);
  const cta = navCta(site);
  const tz = site.wedding.timezone;
  return (
    <header className={cx(styles.nav, variant === "home" && styles.navHome)} data-nav="">
      <div className={styles.inner}>
        <Link href="/" className={styles.logo} aria-label={`${site.couple.names}, página inicial`}>
          <Monograma iniciais={iniciais} bold={14} className={styles.mono} />
        </Link>
        <NavDate
          long={formatDotDate(site.wedding.datetime, tz)}
          short={formatDotDate(site.wedding.datetime, tz, { short: true })}
          always={variant === "pagina"}
        />
        <nav aria-label="Principal" className={styles.desktop}>
          <ul className={styles.links}>
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={item.href === current ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
            {cta ? (
              <li>
                <Link
                  href={cta.href}
                  className={styles.cta}
                  data-cta=""
                  aria-current={cta.href === current ? "page" : undefined}
                >
                  {cta.label}
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
        <MobileMenu items={items} cta={cta} />
      </div>
    </header>
  );
}
