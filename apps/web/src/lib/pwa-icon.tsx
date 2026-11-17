import { ImageResponse } from "next/og";
import { MONOGRAM_VIEWBOX, monogramMarkup } from "@/components/brand";

/*
 * Ícones do app instalável (PWA): monograma DG branco no campo marinho, gerados pelo
 * próprio Next (ImageResponse), sem arquivo de imagem no repositório.
 * `maskable` deixa o monograma dentro da zona segura (80% central), porque o Android
 * recorta o ícone em círculo/gota.
 */
const MARINHO = "#14213D";

export function pwaIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const uri = `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MONOGRAM_VIEWBOX}">${monogramMarkup({
      ink: "#FFFFFF",
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
        background: MARINHO,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori só aceita <img> */}
      <img src={uri} width={w} height={h} alt="" />
    </div>,
    { width: size, height: size },
  );
}
