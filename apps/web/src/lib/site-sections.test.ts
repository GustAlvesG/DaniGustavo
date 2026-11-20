import { describe, expect, it } from "vitest";
import { siteDefaults, type SiteContent } from "@casamento/shared";
import { siteFallbackFor } from "@/lib/site-fallback";
import {
  emphasizeLast,
  fillSiteText,
  footerLinks,
  galleryGroups,
  homeSections,
  initialsOf,
  linkAvailable,
  moduleAvailable,
  navCta,
  navItems,
} from "./site";

const ev = {
  slug: "festa",
  name: "Festa da Lia",
  type: "fifteen",
  timezone: "America/Sao_Paulo",
  startsAt: "2027-08-14T22:00:00.000Z",
};

/** Site neutro de um tipo, com programação, FAQ e uma foto na galeria. */
function siteOf(type: string, patch: (s: SiteContent) => void = () => {}): SiteContent {
  const site = structuredClone({ ...siteFallbackFor({ ...ev, type }), ...siteDefaults(type) });
  site.schedule = [{ time: "19h", title: "Recepção", text: "" }];
  site.faq = [{ question: "Pode levar criança?", answer: "Pode." }];
  site.gallery.items = [
    {
      src: "/uploads/2/a.jpg",
      thumbSrc: null,
      alt: "Foto",
      width: 10,
      height: 10,
      caption: "",
      album: null,
      position: null,
    },
  ];
  patch(site);
  return site;
}

describe("seções da home", () => {
  it("segue a ordem do editor e esconde desligadas e sem dado", () => {
    const site = siteOf("wedding");
    // Neutro: história, álbum e citação desligadas; traje sem dado nenhum.
    expect(homeSections(site)).toEqual(["event", "schedule", "gifts", "messages", "rsvp", "faq"]);
    site.sections.order = [...site.sections.order].reverse();
    expect(homeSections(site)[0]).toBe("faq");
  });

  it("módulo desligado tira a seção da home", () => {
    const site = siteOf("wedding", (s) => {
      s.event.modules.gifts = false;
      s.event.modules.schedule = false;
    });
    expect(homeSections(site)).not.toContain("gifts");
    expect(homeSections(site)).not.toContain("schedule");
  });
});

describe("menu e rodapé", () => {
  it("menu com o vocabulário do tipo (fim do 'O casamento' fixo)", () => {
    expect(navItems(siteOf("fifteen")).map((i) => i.label)).toEqual([
      "A festa",
      "Programação",
      "Presentes",
      "Recados",
      "Dúvidas",
    ]);
    expect(navItems(siteOf("wedding"))[0]).toEqual({ href: "/#casamento", label: "O casamento" });
    expect(navItems(siteOf("corporate"))[0]?.label).toBe("O evento");
  });

  it("módulo desligado some do menu, do botão e do rodapé", () => {
    const site = siteOf("wedding", (s) => {
      s.event.modules.gifts = false;
      s.event.modules.messages = false;
      s.event.modules.rsvp = false;
    });
    const hrefs = navItems(site).map((i) => i.href);
    expect(hrefs).not.toContain("/presentes");
    expect(hrefs).not.toContain("/recados");
    expect(navCta(site)).toBeNull();
    expect(footerLinks(site)).toEqual([]);
    expect(navCta(siteOf("wedding"))).toEqual({ href: "/confirmar", label: "Confirmar presença" });
  });

  it("links extras para galeria e padrinhos só com conteúdo", () => {
    const site = siteOf("wedding", (s) => {
      s.sections.nav.extras = [
        { text: "Galeria", link: "/galeria" },
        { text: "Padrinhos", link: "/padrinhos" },
        { text: "Blog", link: "https://exemplo.com" },
      ];
    });
    const labels = () => navItems(site).map((i) => i.label);
    expect(labels()).toContain("Galeria");
    expect(labels()).not.toContain("Padrinhos");
    expect(labels()).toContain("Blog");
    site.gallery.items = [];
    expect(labels()).not.toContain("Galeria");
  });
});

describe("páginas de módulo (404)", () => {
  it("disponível só com o módulo ligado e conteúdo", () => {
    const site = siteOf("wedding");
    expect(moduleAvailable(site, "gifts")).toBe(true);
    expect(moduleAvailable(site, "gallery")).toBe(true);
    // Manual vazio: 404 mesmo com o módulo ligado.
    expect(moduleAvailable(site, "godparents")).toBe(false);
    site.godparents.dressCode = "Azul";
    expect(moduleAvailable(site, "godparents")).toBe(true);
    site.event.modules.godparents = false;
    expect(moduleAvailable(site, "godparents")).toBe(false);
    // Aniversário não tem padrinhos.
    expect(siteOf("birthday").event.modules.godparents).toBe(false);
  });

  it("linkAvailable olha o módulo dono do caminho", () => {
    const site = siteOf("wedding", (s) => {
      s.event.modules.rsvp = false;
    });
    expect(linkAvailable(site, "/confirmar")).toBe(false);
    expect(linkAvailable(site, "/c/abc")).toBe(false);
    expect(linkAvailable(site, "/presentes?x=1")).toBe(true);
    expect(linkAvailable(site, "/#rsvp")).toBe(true);
    expect(linkAvailable(site, "#topo")).toBe(true);
  });
});

describe("textos", () => {
  it("{prazo} e {data} viram datas do evento", () => {
    const site = siteOf("wedding", (s) => {
      s.wedding.datetime = "2027-04-10T16:00:00-03:00";
      s.rsvp.deadline = "2027-03-10T23:59:59-03:00";
    });
    expect(fillSiteText("Responda até {prazo}.", site)).toBe("Responda até 10 de março.");
    expect(fillSiteText("Casamos em {data}. {outro}", site)).toBe(
      "Casamos em 10 de abril de 2027. {outro}",
    );
  });

  it("ênfase na última palavra do título", () => {
    expect(emphasizeLast("Manual dos padrinhos")).toBe("Manual dos *padrinhos*");
    expect(emphasizeLast("Corte")).toBe("*Corte*");
    expect(emphasizeLast("Já *tem* ênfase")).toBe("Já *tem* ênfase");
  });

  it("iniciais do nome", () => {
    expect(initialsOf("Festa da Maria")).toBe("FM");
    expect(initialsOf("Lia")).toBe("L");
    expect(initialsOf("Érica e João")).toBe("EJ");
  });
});

describe("galleryGroups", () => {
  it("sem álbum: um grupo só; com álbuns: na ordem, soltas primeiro", () => {
    const f = (album: string | null) => ({ album });
    expect(galleryGroups([f(null), f(null)])).toEqual([
      { album: null, photos: [f(null), f(null)] },
    ]);
    expect(galleryGroups([f("Festa"), f(null), f("Igreja"), f("Festa")])).toEqual([
      { album: null, photos: [f(null)] },
      { album: "Festa", photos: [f("Festa"), f("Festa")] },
      { album: "Igreja", photos: [f("Igreja")] },
    ]);
  });
});
