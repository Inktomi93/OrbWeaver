// SQLite captures driver bytes before JSON parsing, so a contribution guard cannot reserialize stale data.
import type { SQL, Table } from "drizzle-orm";
import { getTableColumns, sql } from "drizzle-orm";

export const ROW_TUPLE_ALIAS = "retained_tuple";

/** Capture the actual driver representation of every persisted column. */
export function rowTuple<T extends Table>(table: T): SQL.Aliased<string> {
  return sql<string>`json_array(${sql.join(Object.values(getTableColumns(table)), sql`, `)})`.as(ROW_TUPLE_ALIAS);
}

/** Match the captured bounded collection without one parameter per persisted field. */
export function immutableCollection(query: SQL, tuples: readonly string[]): SQL {
  return sql`(select coalesce(json_group_array(snapshot.${sql.identifier(ROW_TUPLE_ALIAS)}), '[]') from (${query}) as snapshot) = ${JSON.stringify(tuples)}`;
}
