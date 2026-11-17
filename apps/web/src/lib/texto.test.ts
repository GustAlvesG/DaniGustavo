import { describe, expect, it } from "vitest";
import { partesEnfase, preencher } from "./texto";

describe("partesEnfase", () => {
  it("separa as palavras entre asteriscos", () => {
    expect(partesEnfase("Dez anos *colados* no álbum")).toEqual([
      { texto: "Dez anos ", enfase: false },
      { texto: "colados", enfase: true },
      { texto: " no álbum", enfase: false },
    ]);
  });

  it("aceita ênfase no fim e texto sem ênfase", () => {
    expect(partesEnfase("Do nosso *álbum*")).toEqual([
      { texto: "Do nosso ", enfase: false },
      { texto: "álbum", enfase: true },
    ]);
    expect(partesEnfase("Galeria")).toEqual([{ texto: "Galeria", enfase: false }]);
  });
});

describe("preencher", () => {
  it("troca as chaves conhecidas e mantém as outras", () => {
    expect(preencher("Até {prazo}, {x}.", { prazo: "10 de março" })).toBe("Até 10 de março, {x}.");
  });
});
