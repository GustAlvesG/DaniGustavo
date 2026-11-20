import { getEvent } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { decodeHostParam } from "@/lib/host";
import { monogramOf } from "@/lib/site";
import { pwaIcon } from "@/lib/pwa-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícone da tela de início do iPhone/iPad (o iOS não usa o manifest para isso). */
export default async function AppleIcon({ params }: { params: Promise<{ host: string }> }) {
  const ev = await getEvent(decodeHostParam((await params).host));
  const site = await getSite(ev);
  return pwaIcon(180, {
    iniciais: monogramOf(site),
    colors: site.theme.colors,
  });
}
