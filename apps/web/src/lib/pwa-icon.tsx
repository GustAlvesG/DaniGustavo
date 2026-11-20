import { ImageResponse } from "next/og";
import { MONOGRAM_VIEWBOX, monogramMarkup } from "@/components/brand";

/*
 * Ícones do app instalável (PWA): monograma DG (ou as iniciais do evento) na cor clara do tema sobre o campo escuro dele, gerados pelo
 * próprio Next (ImageResponse), sem arquivo de imagem no repositório.
 * `maskable` deixa o monograma dentro da zona segura (80% central), porque o Android
 * recorta o ícone em círculo/gota.
 */
/** Cores do tema do evento (o Álbum/marinho é o padrão). */
export type IconColors = { marinho: string; branco: string };
const ALBUM: IconColors = { marinho: "#14213D", branco: "#FFFFFF" };

export function pwaIcon(
  size: number,
  {
    maskable = false,
    iniciais = null,
    colors = ALBUM,
  }: { maskable?: boolean; iniciais?: string | null; colors?: IconColors } = {},
) {
  if (iniciais) return initialsIcon(size, iniciais, maskable, colors);
  const uri = `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MONOGRAM_VIEWBOX}">${monogramMarkup({
      ink: colors.branco,
      bold: 6,
    })}</svg>`,
  ).toString("base64")}`;
  const w = Math.round(size * (maskable ? 0.5 : 0.62));
  const h = Math.round((w * 492) / 822);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.marinho,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori só aceita <img> */}
      <img src={uri} width={w} height={h} alt="" />
    </div>,
    { width: size, height: size },
  );
}

/** Eventos sem a arte DG: as iniciais em branco no mesmo campo marinho. */
function initialsIcon(size: number, iniciais: string, maskable: boolean, colors: IconColors) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.marinho,
        color: colors.branco,
        fontSize: Math.round(size * (maskable ? 0.3 : 0.4)),
        letterSpacing: Math.round(size * 0.02),
      }}
    >
      {iniciais}
    </div>,
    { width: size, height: size },
  );
}
