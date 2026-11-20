import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteFallbackFor } from "@/content/site-fallback";

/*
 * Página de módulo desligado → notFound(). O cliente da API e o evento da página são
 * trocados por dublês (o resto é o código de verdade).
 */
const ev = {
  id: 7,
  slug: "festa",
  name: "Festa da Lia",
  type: "fifteen",
  timezone: "America/Sao_Paulo",
  startsAt: "2027-08-14T22:00:00.000Z",
  primaryHost: "festa.localhost",
};
const site = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./event", () => ({ currentEvent: async () => ev }));
vi.mock("./client", () => ({
  apiGet: async () => ({ ok: true, status: 200, data: site.current }),
}));

const { getSite, getSiteWithModule } = await import("./site");

describe("getSiteWithModule", () => {
  beforeEach(() => {
    site.current = structuredClone(siteFallbackFor(ev));
  });
  const current = () => site.current as ReturnType<typeof siteFallbackFor>;

  it("devolve o conteúdo com o módulo ligado", async () => {
    await expect(getSiteWithModule("gifts")).resolves.toMatchObject({
      couple: { names: ev.name },
    });
  });

  it("módulo desligado → notFound()", async () => {
    current().event.modules.messages = false;
    await expect(getSiteWithModule("messages")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("galeria sem fotos → notFound()", async () => {
    await expect(getSiteWithModule("gallery")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("evento que não é o casamento original sai como veio da API", async () => {
    expect(await getSite()).toEqual(current());
  });
});
