/**
 * Lógica pura da contagem regressiva.
 *
 * O cálculo é a diferença absoluta entre dois instantes (milissegundos desde
 * a época Unix). O alvo já traz o fuso (ex.: "2027-05-15T16:00:00-03:00"),
 * então horário de verão ou o fuso do aparelho do convidado não interferem.
 * O fuso America/Sao_Paulo só entra para decidir "é hoje?" pela data do
 * calendário local do casamento.
 */

export const WEDDING_TIME_ZONE = "America/Sao_Paulo";

const SECOND = 1_000;

export type Instant = number | Date | string;

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Total de segundos restantes (arredondado para cima). */
  totalSeconds: number;
  /** true quando o alvo já chegou. */
  done: boolean;
};

export type CountdownPhase = "counting" | "today" | "after";

export type CountdownUnit = "days" | "hours" | "minutes" | "seconds";

/** As unidades na ordem em que aparecem. */
export const COUNTDOWN_UNITS: readonly CountdownUnit[] = ["days", "hours", "minutes", "seconds"];

function toMs(value: Instant): number {
  return typeof value === "number" ? value : new Date(value).getTime();
}

/**
 * Dias, horas, minutos e segundos até o alvo. Os segundos são arredondados
 * para cima: faltando 0,4 s, mostra "1 s"; zera só quando o alvo chega.
 */
export function diffParts(now: Instant, target: Instant): CountdownParts {
  const remaining = toMs(target) - toMs(now);
  if (!(remaining > 0)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, done: true };
  }
  const totalSeconds = Math.ceil(remaining / SECOND);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
    done: false,
  };
}

/** Milissegundos até a próxima virada de segundo do relógio. */
export function msUntilNextSecond(now: number): number {
  return SECOND - (((now % SECOND) + SECOND) % SECOND);
}

/** Data do calendário (AAAA-MM-DD) de um instante num fuso. */
export function calendarDate(instant: Instant, timeZone = WEDDING_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toMs(instant));
}

/**
 * "counting" antes do alvo; "today" do alvo até o fim daquele dia em
 * São Paulo; "after" nos dias seguintes.
 */
export function countdownPhase(
  now: Instant,
  target: Instant,
  timeZone = WEDDING_TIME_ZONE,
): CountdownPhase {
  if (toMs(now) < toMs(target)) return "counting";
  return calendarDate(now, timeZone) === calendarDate(target, timeZone) ? "today" : "after";
}

const LABELS: Record<CountdownUnit, { short: [string, string]; long: [string, string] }> = {
  days: { short: ["dia", "dias"], long: ["dia", "dias"] },
  hours: { short: ["hora", "horas"], long: ["hora", "horas"] },
  minutes: { short: ["min", "min"], long: ["minuto", "minutos"] },
  seconds: { short: ["seg", "seg"], long: ["segundo", "segundos"] },
};

/** Rótulo com singular/plural: unitLabel("days", 1) -> "dia". */
export function unitLabel(
  unit: CountdownUnit,
  value: number,
  style: "short" | "long" = "short",
): string {
  const [one, many] = LABELS[unit][style];
  return value === 1 ? one : many;
}

/** Dois dígitos: 4 -> "04". */
export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function joinPtBr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/**
 * Frase para leitor de tela: "Faltam 180 dias, 4 horas e 12 minutos".
 * Sem os segundos (mudariam a cada leitura); omite unidades zeradas e
 * concorda o verbo ("Falta 1 minuto"). No último minuto, "Falta menos de 1 minuto".
 */
export function describeCountdown(parts: CountdownParts): string {
  if (parts.done) return "";
  if (parts.totalSeconds < 60) return "Falta menos de 1 minuto";
  const units: CountdownUnit[] = ["days", "hours", "minutes"];
  const present = units.filter((unit) => parts[unit] > 0);
  const items = present.map((unit) => `${parts[unit]} ${unitLabel(unit, parts[unit], "long")}`);
  const singular = present.length === 1 && parts[present[0]] === 1;
  return `${singular ? "Falta" : "Faltam"} ${joinPtBr(items)}`;
}

/** "15 de maio de 2027" no fuso do casamento. */
export function formatWeddingDate(instant: Instant, timeZone = WEDDING_TIME_ZONE): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(toMs(instant));
}
