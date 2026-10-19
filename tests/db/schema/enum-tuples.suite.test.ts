// @subject packages/db/src/schema/index.ts
// D34: a db enum column derives from the union's one home. Spelling is fenced by the native `orb/db-enum-from-tuple`
// lint rule (no inline array or call result); this test judges the values that reach drizzle: every enum column
// must be member-equal to an exported @orb/contracts or @orb/kit tuple, or be a reviewed local storage tuple.
import { readFileSync } from "node:fs";
import { join } from "node:path";
// biome-ignore lint/performance/noNamespaceImport: the census denominator is every schema export, including tables a named import would omit.
import * as schema from "@orb/db/schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteColumn, SQLiteTable, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";

const CANONICAL_PACKAGES = ["contracts", "kit"] as const;
const manifestSchema = z.object({ exports: z.record(z.string(), z.string()) });

/** Every string-array export of every public subpath of the two vocabulary packages. */
async function canonicalTuples(): Promise<readonly (readonly string[])[]> {
  const tuples: (readonly string[])[] = [];
  for (const pkg of CANONICAL_PACKAGES) {
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, `../../../packages/${pkg}/package.json`), "utf8")));
    for (const subpath of Object.keys(manifest.exports)) {
      const specifier = subpath === "." ? `@orb/${pkg}` : `@orb/${pkg}/${subpath.slice("./".length)}`;
      const exports: Record<string, unknown> = await import(specifier);
      for (const value of Object.values(exports)) {
        if (Array.isArray(value) && value.length > 0 && value.every((member): member is string => typeof member === "string")) {
          tuples.push(value);
        }
      }
    }
  }
  return tuples;
}

function enumColumns(exports: Readonly<Record<string, unknown>>): ReadonlyMap<string, readonly string[]> {
  const columns = new Map<string, readonly string[]>();
  for (const table of new Set(Object.values(exports).filter((value): value is SQLiteTable => is(value, SQLiteTable)))) {
    const keyOf = new Map(Object.entries(table).flatMap(([key, value]) => (is(value, SQLiteColumn) ? [[value, key] as const] : [])));
    for (const column of getTableConfig(table).columns) {
      if (column.enumValues !== undefined) {
        columns.set(`${getTableConfig(table).name}.${keyOf.get(column) ?? column.name}`, column.enumValues);
      }
    }
  }
  return columns;
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const members = new Set(left);
  return members.size === new Set(right).size && right.every((member) => members.has(member));
}

const matchesCanonical = (values: readonly string[], tuples: readonly (readonly string[])[]): boolean => tuples.some((tuple) => sameMembers(values, tuple));

/** Enum columns that match no canonical tuple and carry no reviewed ruling. */
function underived(
  columns: ReadonlyMap<string, readonly string[]>,
  tuples: readonly (readonly string[])[],
  reviewed: Readonly<Record<string, string>>,
): readonly string[] {
  return [...columns].filter(([key, values]) => !(matchesCanonical(values, tuples) || Object.hasOwn(reviewed, key))).map(([key]) => key);
}

/** A ruling for a column that has since gained a canonical home, or stopped being an enum, no longer licenses anything. */
function staleRulings(
  columns: ReadonlyMap<string, readonly string[]>,
  tuples: readonly (readonly string[])[],
  reviewed: Readonly<Record<string, string>>,
): readonly string[] {
  return Object.keys(reviewed).filter((key) => {
    const values = columns.get(key);
    return values === undefined || matchesCanonical(values, tuples);
  });
}

/** Local `as const` storage tuples: each adds to or narrows a contracts vocabulary, or has no contracts home. */
const LOCAL_STORAGE_TUPLES = {
  "automation_fires.outcome": "AUTOMATION_FIRE_STORAGE_OUTCOMES: the contracts fire outcomes plus the storage-only reserved member",
  "chat_stream_events.kind": "STREAM_DELTA_KINDS: the two delta kinds a stream event persists, narrower than the contracts delta kinds",
  "provider_rows.originKind": "PROVIDER_ROW_ORIGINS: the db-owned origin of a provider row, with no contracts home",
  "user_connections.api": "CONNECTION_APIS: the contracts chat APIs plus the db-only auto member",
} as const satisfies Readonly<Record<string, string>>;

test("every enum column in the real schema derives from a canonical tuple or a reviewed local one", async () => {
  const columns = enumColumns(schema);
  const tuples = await canonicalTuples();
  expect(columns.size).toBeGreaterThan(0);
  expect(tuples.length).toBeGreaterThan(0);
  expect(underived(columns, tuples, LOCAL_STORAGE_TUPLES)).toEqual([]);
  expect(staleRulings(columns, tuples, LOCAL_STORAGE_TUPLES)).toEqual([]);
}, 60_000);

test("a column whose members match no canonical tuple is flagged, order does not matter, and a stale ruling is reported", () => {
  const tuples = [["a", "b"]] as const;
  const rows = sqliteTable("rows", {
    id: text("id").primaryKey(),
    canonical: text("canonical", { enum: ["b", "a"] }),
    drifted: text("drifted", { enum: ["a", "b", "c"] }),
    local: text("local", { enum: ["x"] }),
    plain: text("plain"),
  });
  const columns = enumColumns({ rows });
  expect([...columns.keys()]).toEqual(["rows.canonical", "rows.drifted", "rows.local"]);
  expect(underived(columns, tuples, {})).toEqual(["rows.drifted", "rows.local"]);
  expect(underived(columns, tuples, { "rows.drifted": "reviewed", "rows.local": "reviewed" })).toEqual([]);
  expect(staleRulings(columns, tuples, { "rows.canonical": "now canonical", "rows.gone": "column removed", "rows.local": "still local" })).toEqual([
    "rows.canonical",
    "rows.gone",
  ]);
});
