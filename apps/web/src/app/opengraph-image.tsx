import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { MONOGRAM_ART, TILE_COLORS, monogramMarkup, tileMarkup } from "@/components/tiles/designs";
import { getSite } from "@/lib/api/site";
import { formatWeddingDate } from "@/lib/countdown";

/*
 * Imagem da prévia do link (WhatsApp, Open Graph), 1200×630, gerada no build
 * e refeita com o cache de /api/site. O ImageResponse (Satori) não lê woff2
 * nem fontes variáveis: usamos instâncias estáticas em TTF da Bodoni Moda
 * (corte óptico 96) e da Figtree, ambas SIL Open Font License, em `_og/`.
 */

export const alt = "Dani & Gustavo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontDir = join(process.cwd(), "src", "app", "_og");

const svgUri = (viewBox: string, body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`,
  ).toString("base64")}`;

export default async function OpengraphImage() {
  const [bodoni, figtree, site] = await Promise.all([
    readFile(join(fontDir, "BodoniModa-96-Regular.ttf")),
    readFile(join(fontDir, "Figtree-Medium.ttf")),
    getSite(),
  ]);
  const [first, second] = site.couple.names.split(/\s*&\s*/);
  const date = formatWeddingDate(site.wedding.datetime, site.wedding.timezone);

  const tile = svgUri(
    "0 0 100 100",
    `<rect width="100" height="100" fill="${TILE_COLORS.esmalte}"/>${tileMarkup("onda")}`,
  );
  const tileTurned = svgUri(
    "0 0 100 100",
    `<rect width="100" height="100" fill="${TILE_COLORS.esmalte}"/>${tileMarkup("onda", { rotate: 90 })}`,
  );
  const mono = svgUri(MONOGRAM_ART.viewBox, monogramMarkup({ weight: 2.2 }));

  const tilePx = 158;
  const rows = 4;
  const cols = 2;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: TILE_COLORS.esmalte,
        color: "#0E1F4D",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 0 60px 72px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori só aceita <img> */}
        <img src={mono} width={150} height={72} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontFamily: "Bodoni",
              fontSize: 150,
              lineHeight: 0.92,
              letterSpacing: -4,
            }}
          >
            {first}
          </div>
          <div
            style={{
              fontFamily: "Bodoni",
              fontSize: 150,
              lineHeight: 0.92,
              letterSpacing: -4,
            }}
          >
            {`& ${second ?? ""}`}
          </div>
        </div>
        <div style={{ fontFamily: "Figtree", fontSize: 38, color: "#1F3FAE" }}>{date}</div>
      </div>
      <div
        style={{
          width: tilePx * cols,
          display: "flex",
          flexWrap: "wrap",
          borderLeft: "2px solid #E6EDFA",
        }}
      >
        {Array.from({ length: rows * cols }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- Satori só aceita <img>
          <img
            key={i}
            src={(Math.floor(i / cols) + i) % 2 ? tileTurned : tile}
            width={tilePx}
            height={tilePx}
            alt=""
          />
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Bodoni", data: bodoni, style: "normal", weight: 400 },
        { name: "Figtree", data: figtree, style: "normal", weight: 500 },
      ],
    },
  );
}
