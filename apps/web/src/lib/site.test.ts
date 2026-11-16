import { describe, expect, it } from "vitest";
import { SITE_FALLBACK } from "@/content/site-fallback";
import {
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
    expect(e.location).toBe("Local a definir");
    expect(e.description).toContain("15h30");
    expect(new Date(e.end).getTime() - new Date(e.start).getTime()).toBe(8 * 3_600_000);
  });
});
