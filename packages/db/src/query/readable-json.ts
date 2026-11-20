import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * A stored JSON column as an argument to SQLite's `json_*` functions: the column when its text is JSON, else NULL.
 *
 * @remarks A `json_*` function raises `malformed JSON` on text that is not JSON, which aborts the whole statement, so
 * one corrupt row would fail a boot sweep or a whole read. On NULL, `json_extract`, `json_type` and `json_set` return
 * NULL and `json_each` and `json_tree` yield no rows, so the unreadable row matches nothing and is left as stored for
 * its read seam to report. The guard sits inside the argument rather than in a sibling `AND` term because SQLite may
 * evaluate the terms of an `AND` in either order.
 */
export function readableJson(column: AnySQLiteColumn): SQL<string | null> {
  return sql<string | null>`CASE WHEN json_valid(${column}) THEN ${column} END`;
}
