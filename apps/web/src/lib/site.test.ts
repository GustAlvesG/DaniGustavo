import { describe, expect, it } from "vitest";
import { SITE_FALLBACK } from "@/content/site-fallback";
import {
  cityFromAddress,
  formatDotDate,
  mapsLink,
  weddingHeadline,
  monthGrid,
  formatHour,
  formatLongDate,
  osmEmbedUrl,
  splitCoupleNames,
  venueBlocks,
  weddingEvent,
  whatsappUrl,
} from "./site";

describe("splitCoupleNames", () => {
  it("separa pelo &", () => {
    expect(splitCoupleNames("Dani & Gustavo")).toEqual({ first: "Dani", second: "Gustavo" });
  });
  it("aceita 'e' e nomes compostos", () => {
    expect(splitCoupleNames("Ana Luiza e João")).toEqual({ first: "Ana Luiza", second: "João" });
  });
  it("um nome só fica inteiro em first", () => {
    expect(splitCoupleNames("Dani")).toEqual({ first: "Dani", second: "" });
  });
});

describe("datas", () => {
  it("formata no fuso do casamento", () => {
    expect(formatLongDate("2027-05-15T16:00:00-03:00")).toBe("sábado, 15 de maio de 2027");
    expect(formatHour("2027-05-15T16:00:00-03:00")).toBe("16h");
    expect(formatHour("2027-05-15T18:30:00-03:00")).toBe("18h30");
  });
});

describe("venueBlocks", () => {
  it("junta cerimônia e recepção no mesmo lugar", () => {
    expect(venueBlocks(SITE_FALLBACK).map((b) => b.title)).toEqual(["Cerimônia e recepção"]);
  });
  it("separa quando os lugares diferem", () => {
    const site = {
      ...SITE_FALLBACK,
      reception: { ...SITE_FALLBACK.reception, name: "Salão", address: "Rua B, 2" },
    };
    expect(venueBlocks(site).map((b) => b.title)).toEqual(["Cerimônia", "Recepção"]);
  });
});

describe("links", () => {
  it("whatsapp só com dígitos", () => {
    expect(whatsappUrl("+55 (11) 90000-0000", "Oi")).toBe("https://wa.me/5511900000000?text=Oi");
    expect(whatsappUrl("")).toBeNull();
  });
  it("mapa do OSM com marcador", () => {
    const url = osmEmbedUrl(-23.5, -46.6);
    expect(url).toContain("marker=-23.50000,-46.60000");
    expect(url).toContain("layer=mapnik");
  });
});

describe("weddingEvent", () => {
  it("monta o evento da agenda a partir do site", () => {
    const e = weddingEvent(SITE_FALLBACK);
    expect(e.uid).toBe("casamento-20270410@dani-e-gustavo");
    expect(e.title).toBe("Casamento de Dani & Gustavo");
    expect(e.location).toBe("Solare Roma, R. Papagaio, 1800 - Roma, Volta Redonda - RJ, 27257-770");
    expect(e.description).toContain("16h");
    expect(new Date(e.end).getTime() - new Date(e.start).getTime()).toBe(8 * 3_600_000);
  });
});

describe("datas, mapa e calendário", () => {
  it("data com pontos, longa e curta, no fuso do casamento", () => {
    expect(formatDotDate("2027-04-10T16:00:00-03:00")).toBe("10 · 04 · 2027");
    expect(formatDotDate("2027-04-10T16:00:00-03:00", undefined, { short: true })).toBe("10·04·27");
    // 23h30 em São Paulo ainda é dia 10, mesmo já sendo 11 em UTC.
    expect(formatDotDate("2027-04-10T23:30:00-03:00", undefined, { short: true })).toBe("10·04·27");
  });

  it("título do casamento com dia e mês em ênfase", () => {
    expect(weddingHeadline("2027-04-10T16:00:00-03:00")).toBe("Sábado, *10 de abril* de 2027");
  });

  it("link do mapa: o do banco ou uma busca pelo endereço", () => {
    const venue = SITE_FALLBACK.ceremony;
    expect(mapsLink({ ...venue, mapsUrl: "https://maps.app.goo.gl/x" })).toBe(
      "https://maps.app.goo.gl/x",
    );
    expect(mapsLink(venue)).toMatch(
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Solare/,
    );
  });

  it("cidade e UF a partir do endereço", () => {
    expect(cityFromAddress("R. Papagaio, 1800 - Roma, Volta Redonda - RJ, 27257-770")).toBe(
      "Volta Redonda, RJ",
    );
    expect(cityFromAddress("Local a definir")).toBe("");
  });

  it("abril de 2027 começa numa quinta e o dia 10 é sábado", () => {
    const g = monthGrid("2027-04-10T16:00:00-03:00");
    expect(g.month).toBe("abril");
    expect(g.year).toBe(2027);
    expect(g.day).toBe(10);
    expect(g.weeks[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(g.weeks[1]![6]).toBe(10);
    expect(g.weeks.flat().filter(Boolean)).toHaveLength(30);
  });
});
