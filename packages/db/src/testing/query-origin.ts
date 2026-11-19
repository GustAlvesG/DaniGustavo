import { QueryPromise } from "drizzle-orm";
import {
  MySqlDatabase,
  MySqlSelectBase,
  MySqlSelectBuilder,
  MySqlUpdateBuilder,
} from "drizzle-orm/mysql-core";

// Só para testes. O logger do drizzle roda num microtask (`await query` chama `.then` depois),
// então a pilha dele não mostra quem montou a consulta. Aqui guardamos a pilha no momento em que
// o builder é criado (from/set/delete, chamados de forma síncrona pelo código) e a expomos
// enquanto `.then` executa — é nesse trecho síncrono que o drizzle chama `logQuery`.

const ORIGIN = Symbol("queryOrigin");
type WithOrigin = { [ORIGIN]?: string };
type Fn = (this: unknown, ...args: unknown[]) => unknown;

let installed = false;
let current: string | undefined;

function capture(): string {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  return stack;
}

function wrapFactory(proto: object, name: string) {
  const original = Reflect.get(proto, name) as Fn;
  Reflect.set(proto, name, function (this: unknown, ...args: unknown[]) {
    const result = original.apply(this, args) as WithOrigin;
    if (result && typeof result === "object") result[ORIGIN] ??= capture();
    return result;
  });
}

function wrapThen(proto: object) {
  const original = Reflect.get(proto, "then") as Fn;
  Reflect.set(proto, "then", function (this: WithOrigin, ...args: unknown[]) {
    const previous = current;
    current = this[ORIGIN];
    try {
      return original.apply(this, args);
    } finally {
      current = previous;
    }
  });
}

/** Liga o rastreio (idempotente). */
export function trackQueryOrigins() {
  if (installed) return;
  installed = true;
  wrapFactory(MySqlSelectBuilder.prototype, "from");
  wrapFactory(MySqlUpdateBuilder.prototype, "set");
  wrapFactory(MySqlDatabase.prototype, "delete");
  wrapThen(MySqlSelectBase.prototype);
  wrapThen(QueryPromise.prototype);
}

/** Pilha de quem montou a consulta em execução (válida dentro de `logQuery`). */
export function currentQueryOrigin(): string | undefined {
  return current;
}
