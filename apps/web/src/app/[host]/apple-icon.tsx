import { pwaIcon } from "@/lib/pwa-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícone da tela de início do iPhone/iPad (o iOS não usa o manifest para isso). */
export default function AppleIcon() {
  return pwaIcon(180);
}
