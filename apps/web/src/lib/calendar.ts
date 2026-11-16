/**
 * "Adicionar à agenda" (PROMPT §5): arquivo .ics (RFC 5545) e link do Google
 * Agenda. Horários em UTC (sufixo Z): válido em qualquer agenda sem precisar
 * de um bloco VTIMEZONE; o app do convidado converte para o fuso dele.
 */

export type CalendarEvent = {
  /** Identificador estável: reimportar atualiza o evento em vez de duplicar. */
  uid: string;
  title: string;
  /** Início com fuso (ISO 8601). */
  start: string;
  /** Fim com fuso (ISO 8601). */
  end: string;
  location?: string;
  description?: string;
  url?: string;
};

/** Duração usada quando só o início é conhecido. TODO(conteudo): fim real da festa. */
export const DEFAULT_EVENT_HOURS = 8;

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

/** 2027-05-15T16:00:00-03:00 → 20270515T190000Z */
export function toIcsUtc(instant: string | Date): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError(`Data inválida: ${String(instant)}`);
  return d
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

/** Escapa TEXT (RFC 5545 §3.3.11): barra, ponto e vírgula, vírgula e quebras. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Dobra uma linha em pedaços de até 75 octetos (RFC 5545 §3.1), continuando
 * com CRLF + espaço, sem partir um caractere UTF-8 ao meio.
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  // A 1ª linha tem 75 octetos; as seguintes, 74 (o espaço inicial conta).
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = 74;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Monta o arquivo .ics de um evento, com CRLF e linhas dobradas. */
export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dani & Gustavo//Casamento//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push("TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Link "adicionar evento" do Google Agenda. */
export function googleCalendarUrl(event: CalendarEvent, timeZone = "America/Sao_Paulo"): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toIcsUtc(event.start)}/${toIcsUtc(event.end)}`,
    ctz: timeZone,
  });
  if (event.location) params.set("location", event.location);
  const details = [event.description, event.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
