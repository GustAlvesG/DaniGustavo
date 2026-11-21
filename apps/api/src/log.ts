import { createHash } from "node:crypto";
import type { LogLevel } from "@casamento/shared";
import type { MiddlewareHandler } from "hono";
import type { Env } from "./env.ts";

/*
 * Logs estruturados (Fase 6, frente D). Em produção, uma linha JSON por evento (fácil de
 * filtrar com `docker compose logs api | jq`); fora dela, texto legível. Nada de dado pessoal
 * nem segredo: sem corpo, sem query string, sem e-mail; IP só como hash; trechos da URL que
 * parecem token/ID viram `:id`; campos com nome sensível são trocados por "[oculto]".
 */

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  format: "json" | "texto";
  /** Nível mínimo (padrão: info). */
  level?: LogLevel;
  /** Saída (padrão: stdout para debug/info, stderr para warn/error). */
  write?: (line: string, level: LogLevel) => void;
  now?: () => Date;
}

/** Nomes de campo que nunca vão para o log com o valor. */
const SENSITIVE_KEY =
  /e-?mail|senha|password|pass$|token|secret|segredo|cpf|cnpj|key|authorization|cookie|phone|telefone|body|corpo/i;

const EMAIL_RE = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/gi;
/** CPF/CNPJ/telefone/cartão: sequência com 10+ dígitos, com ou sem pontuação (datas têm 8). */
const NUMBER_RUN_RE = /\+?\(?\d[\d.\-/() ]{8,}\d/g;
const maskLongNumber = (run: string) => (run.replace(/\D/g, "").length >= 10 ? "[número]" : run);

/** Tira e-mails e números longos (CPF, telefone, cartão) de um texto livre (mensagem de erro). */
export function scrubText(text: string, max = 500): string {
  const clean = text.replace(EMAIL_RE, "[e-mail]").replace(NUMBER_RUN_RE, maskLongNumber);
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value, 2000);
  if (value instanceof Error) return describeError(value);
  if (Array.isArray(value)) return depth > 3 ? "[…]" : value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === "object") {
    return depth > 3 ? "[…]" : scrubFields(value as LogFields, depth + 1);
  }
  return value;
}

/** Copia os campos trocando os sensíveis por "[oculto]" e limpando os textos. */
export function scrubFields(fields: LogFields, depth = 0): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE_KEY.test(k) && v != null ? "[oculto]" : scrubValue(v, depth);
  }
  return out;
}

/** Erro → campos do log (nome, mensagem limpa, as primeiras linhas da pilha). */
export function describeError(err: unknown): LogFields {
  if (!(err instanceof Error)) return { error: scrubText(String(err)) };
  const stack = err.stack
    ?.split("\n")
    .slice(1, 6)
    .map((l) => l.trim());
  const code = (err as Error & { code?: unknown }).code;
  // O Drizzle embrulha o erro do mysql2 ("Failed query"): o código do banco (ex.:
  // ER_LOCK_DEADLOCK) fica no `cause` e é o que diz o que aconteceu.
  const causeCode = (err as Error & { cause?: { code?: unknown } }).cause?.code;
  return {
    error: err.name,
    message: scrubText(err.message),
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof causeCode === "string" ? { causeCode } : {}),
    ...(stack?.length ? { stack } : {}),
  };
}

export function createLogger(options: LoggerOptions): Logger {
  const min = ORDER[options.level ?? "info"];
  const now = options.now ?? (() => new Date());
  const write =
    options.write ??
    ((line: string, level: LogLevel) =>
      (ORDER[level] >= ORDER.warn ? process.stderr : process.stdout).write(`${line}\n`));
  const emit = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (ORDER[level] < min) return;
    // Campos vazios (ex.: IP ausente) não entram na linha.
    const clean = Object.fromEntries(
      Object.entries(fields ? scrubFields(fields) : {}).filter(([, v]) => v !== undefined),
    );
    if (options.format === "json") {
      write(JSON.stringify({ time: now().toISOString(), level, msg, ...clean }), level);
      return;
    }
    const extra = Object.entries(clean)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    write(`${level === "info" ? "" : `[${level}] `}${msg}${extra ? ` ${extra}` : ""}`, level);
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
  };
}

/**
 * Logger do .env: JSON em produção e texto fora dela (`LOG_FORMAT` muda); nos testes só
 * avisos e erros, para não encher a saída do Vitest.
 */
export function loggerFromEnv(env: Pick<Env, "NODE_ENV" | "LOG_FORMAT">): Logger {
  return createLogger({
    format: env.LOG_FORMAT ?? (env.NODE_ENV === "production" ? "json" : "texto"),
    level: env.NODE_ENV === "test" ? "warn" : "info",
  });
}

/** Hash curto do IP: dá para agrupar acessos de um mesmo visitante sem guardar o endereço. */
export function hashIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash("sha256").update(`ip:${ip}`).digest("hex").slice(0, 16);
}

/**
 * Caminho para o log: sem query; segmentos que parecem token, ULID ou e-mail viram `:id`
 * (os links de convite, pedido, aceite e cadastro levam segredos no caminho).
 */
export function logPath(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      const decoded = (() => {
        try {
          return decodeURIComponent(seg);
        } catch {
          return seg;
        }
      })();
      if (decoded.includes("@") || (decoded.length >= 16 && /\d/.test(decoded))) return ":id";
      return seg;
    })
    .join("/");
}

/** IP do visitante como o edge entrega (X-Real-IP / X-Forwarded-For). */
export function clientIp(headers: Pick<Headers, "get">): string | undefined {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined
  );
}

/**
 * Uma linha por requisição (método, caminho limpo, status, duração, hash do IP) e, em 5xx, o
 * erro e o aviso `onServerError` (alerta da plataforma). O `/api/health` não entra: o
 * healthcheck do Docker bate nele a cada poucos segundos.
 */
export function requestLog(
  logger: Logger,
  onServerError?: (info: { method: string; path: string; status: number; error?: unknown }) => void,
): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    await next();
    const path = c.req.path;
    if (path === "/api/health") return;
    const status = c.res.status;
    const fields: LogFields = {
      method: c.req.method,
      path: logPath(path),
      status,
      ms: Math.round(performance.now() - started),
      ip: hashIp(clientIp(c.req.raw.headers)),
    };
    if (status >= 500) {
      logger.error("request", { ...fields, ...(c.error ? describeError(c.error) : {}) });
      onServerError?.({ method: c.req.method, path: logPath(path), status, error: c.error });
    } else {
      logger.info("request", fields);
    }
  };
}
