import { getEvent } from "@/lib/api/event";
import { getSite } from "@/lib/api/site";
import { decodeHostParam } from "@/lib/host";
import { contentFor } from "@/lib/legacy-content";
import { pwaIcon } from "@/lib/pwa-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícone da tela de início do iPhone/iPad (o iOS não usa o manifest para isso). */
export default async function AppleIcon({ params }: { params: Promise<{ host: string }> }) {
  const ev = await getEvent(decodeHostParam((await params).host));
  return pwaIcon(180, {
    iniciais: contentFor(ev).iniciais,
    colors: (await getSite(ev)).theme.colors,
  });
}
