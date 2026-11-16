import { describe, expect, it } from "vitest";
import {
  addHours,
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  toIcsUtc,
  type CalendarEvent,
} from "./calendar";

const event: CalendarEvent = {
  uid: "casamento-20270515@dani-e-gustavo",
  title: "Casamento de Dani & Gustavo",
  start: "2027-05-15T16:00:00-03:00",
  end: addHours("2027-05-15T16:00:00-03:00", 8),
  location: "Igreja Nossa Senhora, Rua das Flores, 10; São Paulo",
  description: "Cerimônia às 16h.\nDetalhes no site.",
  url: "https://exemplo.com/",
};

describe("toIcsUtc", () => {
  it("converte para UTC no formato básico", () => {
    expect(toIcsUtc("2027-05-15T16:00:00-03:00")).toBe("20270515T190000Z");
    expect(toIcsUtc(new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 678)))).toBe("20260102T030405Z");
  });

  it("recusa datas inválidas", () => {
    expect(() => toIcsUtc("amanhã")).toThrow(RangeError);
  });
});

describe("escapeIcsText", () => {
  it("escapa barra, ponto e vírgula, vírgula e quebras de linha", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldIcsLine", () => {
  it("não mexe em linhas curtas", () => {
    expect(foldIcsLine("SUMMARY:curta")).toBe("SUMMARY:curta");
  });

  it("dobra em 75 octetos sem partir caracteres UTF-8", () => {
    const line = "DESCRIPTION:" + "ção ".repeat(40);
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    parts.forEach((p, i) => {
      expect(enc.encode(p).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(" ")).toBe(true);
    });
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });
});

describe("buildIcs", () => {
  const ics = buildIcs(event, new Date(Date.UTC(2026, 10, 16, 12, 0, 0)));
  const lines = ics.split("\r\n");

  it("usa CRLF em todas as linhas e termina com CRLF", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("tem a estrutura e os campos obrigatórios", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("END:VEVENT");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines).toContain("UID:casamento-20270515@dani-e-gustavo");
    expect(lines).toContain("DTSTAMP:20261116T120000Z");
    expect(lines).toContain("DTSTART:20270515T190000Z");
    expect(lines).toContain("DTEND:20270516T030000Z");
  });

  it("escapa o texto do local e da descrição", () => {
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(
      "LOCATION:Igreja Nossa Senhora\\, Rua das Flores\\, 10\\; São Paulo",
    );
    expect(unfolded).toContain("DESCRIPTION:Cerimônia às 16h.\\nDetalhes no site.");
    expect(unfolded).toContain("SUMMARY:Casamento de Dani & Gustavo");
  });
});

describe("googleCalendarUrl", () => {
  it("monta o link de modelo com datas em UTC", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20270515T190000Z/20270516T030000Z");
    expect(url.searchParams.get("text")).toBe("Casamento de Dani & Gustavo");
    expect(url.searchParams.get("ctz")).toBe("America/Sao_Paulo");
    expect(url.searchParams.get("details")).toContain("https://exemplo.com/");
  });
});
