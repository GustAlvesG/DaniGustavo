import { customType, datetime } from "drizzle-orm/mysql-core";

/**
 * JSON portátil entre MySQL 8 e MariaDB 10.4.
 * No MariaDB, `JSON` é um alias de LONGTEXT e o driver devolve string; no MySQL 8 o
 * driver já devolve objeto. Este tipo aceita os dois formatos na leitura.
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
