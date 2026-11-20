import { bigint, customType, datetime } from "drizzle-orm/mysql-core";

/**
 * JSON portátil entre MySQL 8 e MariaDB 10.4.
 * No MariaDB, `JSON` é um alias de LONGTEXT; no MySQL 8 (e no MariaDB ≥ 10.5) a coluna vem
 * marcada como JSON. O pool usa `jsonStrings: true` (client.ts), então o driver sempre devolve
 * o texto e o parse é feito aqui. Objeto já pronto também é aceito, por garantia.
 */
export const json = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      return "json";
    },
    toDriver(value: TData): string {
      return JSON.stringify(value);
    },
    fromDriver(value: unknown): TData {
      if (typeof value === "string") return JSON.parse(value) as TData;
      return value as TData;
    },
  })(name);

/**
 * Datas em DATETIME(3), sempre em UTC (o drizzle serializa via toISOString).
 * Sem DEFAULT no banco: evita diferenças de expressões padrão e de fuso entre
 * MariaDB e MySQL. O valor padrão é gerado na aplicação.
 */
export const utcDatetime = (name: string) => datetime(name, { mode: "date", fsp: 3 });

export const createdAt = () =>
  utcDatetime("created_at")
    .notNull()
    .$defaultFn(() => new Date());

export const updatedAt = () =>
  utcDatetime("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

// Chave primária BIGINT UNSIGNED AUTO_INCREMENT. Não usamos `serial`: o drizzle-kit gera
// "serial AUTO_INCREMENT", que o MariaDB 10.4 rejeita.
export const pk = () =>
  bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey();
// FK para essas chaves.
export const fk = (name: string) => bigint(name, { mode: "number", unsigned: true });
