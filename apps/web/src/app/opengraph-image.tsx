import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { MONOGRAM_ART, TILE_COLORS, monogramMarkup, tileMarkup } from "@/components/tiles/designs";
import { getSite } from "@/lib/api/site";
import { formatWeddingDate } from "@/lib/countdown";
import { cityFromAddress, splitCoupleNames } from "@/lib/site";

/*
 * Imagem da prévia do link (WhatsApp, Open Graph), 1200×630, gerada no build
 * e refeita com o cache de /api/site. Campo marinho com o DG branco, os nomes
 * e, em linhas separadas, a data e a cidade; à direita, um arco de azulejos
 * (o painel vertical do manual do casal).
 *
 * O ImageResponse (Satori) não lê woff2 nem fontes variáveis: usamos
 * instâncias estáticas em TTF da Bodoni Moda (corte óptico 96) e da Figtree,
 * ambas SIL Open Font License, em `_og/`.
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
  const { first, second } = splitCoupleNames(site.couple.names);
  const date = formatWeddingDate(site.wedding.datetime, site.wedding.timezone);
  const city = cityFromAddress(site.ceremony.address);

  const tileAt = (rotate: 0 | 90 | 180 | 270) =>
    svgUri(
      "0 0 100 100",
      `<rect width="100" height="100" fill="${TILE_COLORS.marinho}"/>${tileMarkup("rosa", { rotate, washOpacity: 0.16 })}`,
    );
  const tiles = [tileAt(0), tileAt(90), tileAt(270), tileAt(180)];
  const mono = svgUri(MONOGRAM_ART.viewBox, monogramMarkup({ ink: TILE_COLORS.branco, bold: 8 }));

  const archW = 344;
  const tile = archW / 2;
  const nameStyle = {
    fontFamily: "Bodoni",
    fontSize: 136,
    lineHeight: 0.92,
    letterSpacing: -3.5,
    color: TILE_COLORS.branco,
  } as const;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: TILE_COLORS.marinho,
        padding: "0 78px 0 80px",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 0 62px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori só aceita <img> */}
        <img src={mono} width={150} height={90} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={nameStyle}>{first}</div>
          <div style={nameStyle}>{`& ${second}`}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "Figtree", fontSize: 36, color: TILE_COLORS.celeste }}>
            {date}
          </div>
          {city ? (
            <div style={{ fontFamily: "Figtree", fontSize: 30, color: TILE_COLORS.serenity }}>
              {city}
            </div>
          ) : null}
        </div>
      </div>

      {/* Arco de azulejos com fio duplo (moldura dos cartões do casal). */}
      <div
        style={{
          display: "flex",
          alignSelf: "flex-end",
          width: archW + 28,
          height: 556,
          padding: 12,
          paddingBottom: 0,
          border: `2px solid ${TILE_COLORS.serenity}`,
          borderBottom: "none",
          borderTopLeftRadius: (archW + 28) / 2,
          borderTopRightRadius: (archW + 28) / 2,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            width: archW,
            height: 544,
            overflow: "hidden",
            borderTopLeftRadius: archW / 2,
            borderTopRightRadius: archW / 2,
            border: `3px solid ${TILE_COLORS.branco}`,
            borderBottom: "none",
          }}
        >
          {Array.from({ length: 8 }, (_, i) => {
            const row = Math.floor(i / 2);
            const col = i % 2;
            return (
              // eslint-disable-next-line @next/next/no-img-element -- Satori só aceita <img>
              <img
                key={i}
                src={tiles[(row % 2) * 2 + col]}
                width={tile - 3}
                height={tile - 3}
                alt=""
              />
            );
          })}
        </div>
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
