import { describe, expect, it } from "vitest";
import { contentFor, initialsOf, siteFallbackFor } from "./legacy-content";

const outro = {
  slug: "ana-bruno",
  name: "Ana & Bruno",
  type: "wedding",
  timezone: "America/Sao_Paulo",
  startsAt: "2028-01-20T18:00:00.000Z",
};

describe("legacy-content", () => {
  it("só o dani-gustavo tem fotos, galeria, padrinhos e o DG", () => {
    const dg = contentFor({ slug: "dani-gustavo", name: "Dani & Gustavo", type: "wedding" });
    expect(dg.legado).toBe(true);
    expect(dg.galeria).not.toBeNull();
    expect(dg.padrinhos).toBe(true);
    expect(dg.iniciais).toBeNull();
    expect(dg.home.hero.fotoDesktop).not.toBeNull();
  });

  it("outros eventos: neutro, sem fotos nem páginas do casal", () => {
    const c = contentFor(outro);
    expect(c.legado).toBe(false);
    expect(c.galeria).toBeNull();
    expect(c.padrinhos).toBe(false);
    expect(c.iniciais).toBe("AB");
    expect(c.home.hero.fotoDesktop).toBeNull();
    expect(c.home.historia.momentos).toEqual([]);
    expect(c.home.secoes).not.toContain("versiculo");
    expect(c.home.menu.extras).toEqual([]);
    expect(c.home.rodape.links.map((l) => l.link)).not.toContain("/galeria");
    expect(JSON.stringify(c)).not.toMatch(/\.jpg|Isaías|Gustavo/);
  });

  it("reserva do /site só é a do casamento para ele", () => {
    const fb = siteFallbackFor(outro);
    expect(fb.couple.names).toBe("Ana & Bruno");
    expect(fb.wedding.datetime).toBe(outro.startsAt);
    expect(JSON.stringify(fb)).not.toMatch(/Gustavo|Solare/);
  });

  it("iniciais do nome", () => {
    expect(initialsOf("Festa da Maria")).toBe("FM");
    expect(initialsOf("Lia")).toBe("L");
    expect(initialsOf("Érica e João")).toBe("EJ");
  });
});
