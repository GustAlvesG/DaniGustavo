import { describe, expect, it } from "vitest";
import { formatFee, formatPrice, limitLines, priceLine, trialLine } from "./format";

describe("página de preços", () => {
  it("formata o preço em reais e avisa quando ainda não há preço", () => {
    expect(formatPrice(4990)).toBe("R$ 49,90");
    expect(formatPrice(null)).toBeNull();
    expect(priceLine({ priceMonthlyCents: 4990, priceYearlyCents: 49900 })).toBe(
      "R$ 49,90 por mês",
    );
    expect(priceLine({ priceMonthlyCents: null, priceYearlyCents: 49900 })).toBe(
      "R$ 499,00 por ano",
    );
    expect(priceLine({ priceMonthlyCents: null, priceYearlyCents: null })).toBe("Preço em breve");
  });

  it("mostra a taxa em porcentagem", () => {
    expect(formatFee(50)).toBe("0,5%");
    expect(formatFee(250)).toBe("2,5%");
    expect(formatFee(0)).toBe("0%");
  });

  it("descreve os limites", () => {
    expect(
      limitLines({
        activeEvents: 1,
        guestsPerEvent: 300,
        members: 2,
        storageMb: 500,
        modules: null,
      }),
    ).toEqual([
      "1 evento ativo por vez",
      "Até 300 convidados por evento",
      "Até 2 pessoas na equipe",
      "500 MB para fotos e arquivos",
    ]);
    expect(
      limitLines({
        activeEvents: null,
        guestsPerEvent: 1000,
        members: null,
        storageMb: 5000,
        modules: null,
      }),
    ).toEqual([
      "Eventos ativos à vontade",
      "Até 1.000 convidados por evento",
      "Equipe sem limite",
      "5 GB para fotos e arquivos",
    ]);
  });

  it("teste grátis", () => {
    expect(trialLine(14)).toBe("14 dias grátis para experimentar");
    expect(trialLine(0)).toBeNull();
  });
});
