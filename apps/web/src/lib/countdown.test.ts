import { describe, expect, it } from "vitest";
import {
  calendarDate,
  countdownPhase,
  describeCountdown,
  diffParts,
  formatWeddingDate,
  msUntilNextMinute,
  pad2,
  unitLabel,
} from "./countdown";

const TARGET = "2027-05-15T16:00:00-03:00";
const T = new Date(TARGET).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("diffParts", () => {
  it("decompõe dias, horas e minutos", () => {
    const now = T - (180 * DAY + 4 * HOUR + 12 * MIN);
    expect(diffParts(now, TARGET)).toEqual({
      days: 180,
      hours: 4,
      minutes: 12,
      totalMinutes: 180 * 1440 + 4 * 60 + 12,
      done: false,
    });
  });

  it("aceita Date, número e string ISO", () => {
    const now = T - 90 * MIN;
    expect(diffParts(new Date(now), new Date(T))).toEqual(diffParts(now, TARGET));
  });

  it("está concluída exatamente no alvo", () => {
    expect(diffParts(T, TARGET)).toMatchObject({ days: 0, hours: 0, minutes: 0, done: true });
  });

  it("está concluída depois do alvo, sem números negativos", () => {
    expect(diffParts(T + 5 * DAY, TARGET)).toMatchObject({
      days: 0,
      hours: 0,
      minutes: 0,
      done: true,
    });
  });

  it("arredonda os minutos para cima (30 s restantes = 1 min)", () => {
    expect(diffParts(T - 30_000, TARGET)).toMatchObject({ days: 0, hours: 0, minutes: 1 });
    expect(diffParts(T - 1, TARGET)).toMatchObject({ minutes: 1, done: false });
  });

  it("vira o dia corretamente", () => {
    expect(diffParts(T - DAY, TARGET)).toMatchObject({ days: 1, hours: 0, minutes: 0 });
    expect(diffParts(T - DAY + MIN, TARGET)).toMatchObject({ days: 0, hours: 23, minutes: 59 });
  });

  it("calcula por instante, independente do fuso em que a data foi escrita", () => {
    // 19:00 UTC é 16:00 em São Paulo: mesmo instante do alvo.
    expect(diffParts("2027-05-15T19:00:00Z", TARGET).done).toBe(true);
    // Mesmo relógio de parede em Lisboa (+01:00) acontece 4 h antes.
    expect(diffParts("2027-05-15T16:00:00+01:00", TARGET)).toMatchObject({ hours: 4, minutes: 0 });
  });

  it("trata instante inválido como concluído", () => {
    expect(diffParts(Number.NaN, TARGET).done).toBe(true);
  });
});

describe("msUntilNextMinute", () => {
  it("mede até a próxima virada", () => {
    expect(msUntilNextMinute(T)).toBe(MIN);
    expect(msUntilNextMinute(T + 59_000)).toBe(1_000);
    expect(msUntilNextMinute(T + 1)).toBe(MIN - 1);
  });
});

describe("countdownPhase", () => {
  it("conta antes do alvo", () => {
    expect(countdownPhase(T - 1, TARGET)).toBe("counting");
  });

  it("é hoje do alvo até a meia-noite de São Paulo", () => {
    expect(countdownPhase(T, TARGET)).toBe("today");
    expect(countdownPhase("2027-05-15T23:59:00-03:00", TARGET)).toBe("today");
  });

  it("vira para depois à meia-noite de São Paulo, não de UTC", () => {
    // 22:00 em SP = 01:00 UTC do dia 16: ainda é hoje.
    expect(countdownPhase("2027-05-16T01:00:00Z", TARGET)).toBe("today");
    expect(countdownPhase("2027-05-16T00:00:00-03:00", TARGET)).toBe("after");
  });

  it("usa a data do calendário no fuso", () => {
    expect(calendarDate("2027-05-16T01:00:00Z")).toBe("2027-05-15");
  });
});

describe("rótulos e texto", () => {
  it("concorda singular e plural", () => {
    expect(unitLabel("days", 1)).toBe("dia");
    expect(unitLabel("days", 0)).toBe("dias");
    expect(unitLabel("hours", 1)).toBe("hora");
    expect(unitLabel("hours", 2)).toBe("horas");
    expect(unitLabel("minutes", 1)).toBe("min");
    expect(unitLabel("minutes", 1, "long")).toBe("minuto");
    expect(unitLabel("minutes", 5, "long")).toBe("minutos");
  });

  it("completa com zero à esquerda", () => {
    expect(pad2(4)).toBe("04");
    expect(pad2(12)).toBe("12");
  });

  it("descreve para leitor de tela", () => {
    expect(describeCountdown(diffParts(T - (180 * DAY + 4 * HOUR + 12 * MIN), T))).toBe(
      "Faltam 180 dias, 4 horas e 12 minutos",
    );
    expect(describeCountdown(diffParts(T - (DAY + MIN), T))).toBe("Faltam 1 dia e 1 minuto");
    expect(describeCountdown(diffParts(T - MIN, T))).toBe("Falta 1 minuto");
    expect(describeCountdown(diffParts(T - HOUR, T))).toBe("Falta 1 hora");
    expect(describeCountdown(diffParts(T - 2 * DAY, T))).toBe("Faltam 2 dias");
    expect(describeCountdown(diffParts(T, T))).toBe("");
  });

  it("formata a data do casamento", () => {
    expect(formatWeddingDate(TARGET)).toBe("15 de maio de 2027");
  });
});
