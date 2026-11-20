import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { MONOGRAM_VIEWBOX, monogramMarkup } from "@/components/brand";
import { getEvent } from "@/lib/api/event";
import { getContent, getSite } from "@/lib/api/site";
import { decodeHostParam } from "@/lib/host";
import { formatWeddingDate } from "@/lib/countdown";
import { cityFromAddress } from "@/lib/site";
import { ogFonts } from "../_og/fonts";

/*
 * Imagem da prévia do link (WhatsApp, Open Graph), 1200×630, gerada no build
 * e refeita com o cache de /api/site. Campo escuro do tema com o DG claro, os nomes
 * na fonte cursiva do tema (Pinyon Script no Álbum), a data e a cidade; à direita, a foto do hero no arco com
 * moldura branca (a mesma forma do traje na home).
 *
 * O ImageResponse (Satori) não lê woff2 nem fontes variáveis: usamos TTFs
 * estáticos da Pinyon Script e da Jost (SIL Open Font License) em `_og/`.
 */

export const alt = "Convite do evento";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const photoDir = join(process.cwd(), "public", "fotos");

const svgUri = (viewBox: string, body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`,
  ).toString("base64")}`;

export default async function OpengraphImage({ params }: { params: Promise<{ host: string }> }) {
  const ev = await getEvent(decodeHostParam((await params).host));
  const { home, iniciais } = await getContent(ev);
  const fotoArco = home.hero.fotoCelular;
  const [photo, site] = await Promise.all([
    fotoArco ? readFile(join(photoDir, fotoArco.arquivo)) : null,
    getSite(ev),
  ]);
  // Cores e fontes do tema do evento (Álbum/marinho = as de antes).
  const { theme } = site;
  const COLORS = {
    marinho: theme.colors.marinho,
    branco: theme.colors.branco,
    nevoa: theme.colors.nevoa,
    serenity: theme.colors.serenity,
  };
  const fonts = await ogFonts(theme);
  const date = formatWeddingDate(site.wedding.datetime, site.wedding.timezone);
  const city = cityFromAddress(site.ceremony.address);
  const mono = svgUri(MONOGRAM_VIEWBOX, monogramMarkup({ ink: COLORS.branco, bold: 8 }));
  const photoUri = photo ? `data:image/jpeg;base64,${photo.toString("base64")}` : null;

  const archW = 360;
  const archH = 540;
  // Álbum: arco; Festa: cantos grandes; Moderno: quase reto.
  const archTop = theme.theme === "album" ? archW / 2 : theme.theme === "festa" ? 120 : 8;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: COLORS.marinho,
        padding: "0 90px 0 84px",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 0 64px",
        }}
      >
        {iniciais ? (
          <div style={{ fontFamily: "Ui", fontSize: 64, letterSpacing: 12, color: COLORS.branco }}>
            {iniciais}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- Satori só aceita <img>
          <img src={mono} width={140} height={84} alt="" />
        )}
        <div
          style={{
            fontFamily: "Nomes",
            fontSize: fonts.names.script ? 128 : 92,
            lineHeight: 1.05,
            color: COLORS.branco,
          }}
        >
          {site.couple.names}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontFamily: "Ui",
              fontSize: 30,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: COLORS.nevoa,
            }}
          >
            {date}
          </div>
          {city ? (
            <div
              style={{
                fontFamily: "Ui",
                fontSize: 26,
                letterSpacing: 5,
                textTransform: "uppercase",
                color: COLORS.serenity,
              }}
            >
              {city}
            </div>
          ) : null}
        </div>
      </div>

      {photoUri ? (
        <>
          {/* A foto do casal no arco, com moldura branca. */}
          <div
            style={{
              display: "flex",
              alignSelf: "center",
              width: archW,
              height: archH,
              border: `10px solid ${COLORS.branco}`,
              borderTopLeftRadius: archTop,
              borderTopRightRadius: archTop,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori só aceita <img> */}
            <img
              src={photoUri}
              width={archW - 20}
              height={archH - 20}
              alt=""
              style={{ objectFit: "cover" }}
            />
          </div>
        </>
      ) : null}
    </div>,
    {
      ...size,
      fonts: [
        { name: "Nomes", data: fonts.names.data, style: "normal", weight: 400 },
        { name: "Ui", data: fonts.ui, style: "normal", weight: 500 },
      ],
    },
  );
}
