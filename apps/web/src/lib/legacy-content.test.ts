import { describe, expect, it } from "vitest";
import { siteFallbackFor } from "@/content/site-fallback";
import {
  contentFor,
  hasDefaultSections,
  legacyGallery,
  legacySections,
  monogramFor,
  withLegacyContent,
  type PhotoSize,
} from "./legacy-content";

const outro = {
  slug: "ana-bruno",
  name: "Ana & Bruno",
  type: "wedding",
  timezone: "America/Sao_Paulo",
  startsAt: "2028-01-20T18:00:00.000Z",
};
const dg = { ...outro, slug: "dani-gustavo", name: "Dani & Gustavo" };
// Sem ler o disco: tamanho fixo para toda foto de public/fotos.
const size: PhotoSize = (arquivo) => ({ src: `/fotos/${arquivo}`, width: 1200, height: 800 });

describe("legacy-content (ponte até a importação do casamento)", () => {
  it("traduz content/*.ts para o formato de site.sections", () => {
    const s = legacySections(size);
    expect(s.order.map((o) => o.id)).toEqual([
      "story",
      "album",
      "event",
      "verse",
      "schedule",
      "dresscode",
      "gifts",
      "messages",
      "rsvp",
      "faq",
    ]);
    expect(s.hero.kicker).toBe("Vamos nos casar");
    expect(s.hero.photoDesktop).toMatchObject({
      src: "/fotos/dsc06378.jpg",
      position: "center 55%",
    });
    expect(s.story.items).toHaveLength(5);
    expect(s.event.menu).toBe("O casamento");
    expect(s.nav.extras).toEqual([{ text: "Galeria", link: "/galeria" }]);
    expect(s.pages.messages.formButton).toBe("Enviar recado");
    expect(legacyGallery(size)[0]).toMatchObject({ src: "/fotos/dsc06378.jpg", album: null });
  });

  it("só troca as seções do dani-gustavo e só enquanto são as neutras", () => {
    const neutral = siteFallbackFor(dg);
    expect(hasDefaultSections(neutral)).toBe(true);
    const legacy = withLegacyContent(dg, neutral, size);
    expect(legacy.sections.hero.photoMobile?.src).toBe("/fotos/dsc06264.jpg");
    expect(legacy.gallery.items.length).toBeGreaterThan(20);
    // Outro evento: passa direto.
    expect(withLegacyContent(outro, siteFallbackFor(outro), size)).toEqual(siteFallbackFor(outro));
    // Casamento já importado (seções gravadas): passa direto.
    expect(hasDefaultSections(legacy)).toBe(false);
    expect(withLegacyContent(dg, legacy, size)).toBe(legacy);
  });

  it("monograma: DG desenhado só no casamento original", () => {
    expect(monogramFor(dg)).toBeNull();
    expect(monogramFor(outro)).toBe("AB");
    expect(contentFor(outro)).toMatchObject({ legado: false, iniciais: "AB" });
    expect(contentFor(outro).home.hero.fotoCelular).toBeNull();
  });

  it("reserva do /site não leva dados do casamento de exemplo", () => {
    const fb = siteFallbackFor(outro);
    expect(fb.couple.names).toBe("Ana & Bruno");
    expect(fb.wedding.datetime).toBe(outro.startsAt);
    expect(JSON.stringify(fb)).not.toMatch(/Gustavo|Solare/);
  });
});
