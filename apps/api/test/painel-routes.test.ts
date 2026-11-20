import { describe, expect, it } from "vitest";
import {
  parseEventPath,
  parseOrgPath,
  pickerTarget,
  pickerValue,
  resolveRedirect,
} from "../painel/src/routes.ts";

describe("rotas do painel", () => {
  it("lê caminhos de evento e de organização", () => {
    expect(parseEventPath("/e/3/convites?x=1")).toEqual({ eventId: 3, rest: "/convites?x=1" });
    expect(parseEventPath("/e/3")).toEqual({ eventId: 3, rest: "/" });
    expect(parseEventPath("/e/0")).toBeNull();
    expect(parseOrgPath("/o/2/eventos/5/anfitrioes")).toEqual({
      orgId: 2,
      rest: "/eventos/5/anfitrioes",
    });
    expect(parseOrgPath("/o/x")).toBeNull();
    expect(parseOrgPath("/e/2")).toBeNull();
  });

  it("seletor: valor e destino", () => {
    expect(pickerTarget(pickerValue("e", 7))).toBe("/e/7");
    expect(pickerTarget(pickerValue("o", 2))).toBe("/o/2");
    expect(pickerTarget("lixo")).toBe("/eventos");
  });

  it("redireciona conforme o que o usuário acessa", () => {
    const ev = [{ id: 1 }];
    // só evento (anfitrião): entra direto
    expect(resolveRedirect("/", ev, null)).toBe("/e/1");
    expect(resolveRedirect("/eventos", ev, null)).toBe("/e/1");
    expect(resolveRedirect("/convites", ev, null)).toBe("/e/1/convites");
    expect(resolveRedirect("/e/9", ev, null)).toBe("/e/1");
    expect(resolveRedirect("/o/1", ev, null)).toBe("/eventos");
    // sem evento, com organização
    expect(resolveRedirect("/", [], null, [{ id: 4 }])).toBe("/o/4");
    expect(resolveRedirect("/o/4/equipe", [], null, [{ id: 4 }])).toBeNull();
    expect(resolveRedirect("/o/5", [], null, [{ id: 4 }])).toBe("/o/4");
    // com organização, #/eventos mostra a lista (eventos + organizações)
    expect(resolveRedirect("/eventos", ev, null, [{ id: 4 }])).toBeNull();
    // vários eventos: lembra o último
    const many = [{ id: 1 }, { id: 2 }];
    expect(resolveRedirect("/", many, 2)).toBe("/e/2");
    expect(resolveRedirect("/", many, null)).toBe("/eventos");
  });
});
