// tests/support/db — freshDb (core/Spine-Testing.md §2): a libSQL `:memory:` db per call for the `.int` lane.
// freshDb PUSHES the LIVE schema (it diffs `@orb/db/schema` against an empty snapshot via drizzle-kit's
// programmatic API and applies the resulting CREATE statements over the real createDb handle), so a slice
// test always runs against the current schema regardless of whether `0000_baseline.sql` has been
// regenerated yet — fast + drift-proof for per-table tests. The committed baseline + the `runMigrations`
// FK-dance + `assertReferentialIntegrity`'s throw path are covered by `tests/db/client.int.test.ts`, and
// the committed baseline ↔ schema equivalence by `tests/tooling/schema-baseline-parity.int.test.ts`.
//
// freshCountedDb adds a QUERY-BUDGET counter over the same handle: the counting proxy rides `createDb`'s
// `LibSqlWrap` seam — the SAME seam `foundation/observability`'s `wrapLibSqlClient` uses for OTel spans
// in production — so what a budget test counts is exactly what shows up as `db.*` spans at runtime.

import type { Db, LibSqlWrap } from "@orb/db";
import { createDb } from "@orb/db";
// biome-ignore lint/performance/noNamespaceImport: drizzle-kit's snapshot API takes the whole schema module as a Record — namespace import is the canonical way to pass every table.
import * as schema from "@orb/db/schema";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { sql } from "drizzle-orm";

/** Diff the live schema against empty and apply the CREATE statements (see the header). */
async function pushLiveSchema(db: Db): Promise<void> {
  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema as Record<string, unknown>);
  const statements = await generateSQLiteMigration(empty, current);
  for (const statement of statements) {
    // biome-ignore lint/performance/noAwaitInLoops: DDL must apply sequentially in emitted order on one connection — Promise.all would race CREATE statements and corrupt dependency order.
    await db.run(sql.raw(statement));
  }
}

/** A fresh in-memory db with the full schema applied (FK enforcement ON, via createDb). */
export async function freshDb(): Promise<Db> {
  const db = await createDb(":memory:");
  await pushLiveSchema(db);
  return db;
}

export interface DbQueryCounter {
  /** Statements issued since the last reset. `db.batch([...])` counts each statement. */
  readonly count: () => number;
  /** SQL texts in issue order — print these in the failure message when a budget trips. */
  readonly statements: () => readonly string[];
  readonly reset: () => void;
}

/**
 * freshDb + a query counter, for QUERY-BUDGET tests: assert a verb stays within its expected round-trip
 * count so an accidental per-row loop (N+1) fails loud instead of scaling silently with data size.
 * Budgets assert `toBeLessThanOrEqual(n)` (a ceiling), not an exact count — the test guards efficiency,
 * not the implementation's statement-by-statement shape.
 *
 * The counter resets after the schema push so it covers only what the test body runs. Limitation (same
 * as the OTel tracer at this seam): an interactive `client.transaction()` counts as ONE entry — inner
 * statements aren't individually visible. Domain code batches via `db.batch`, which counts per statement.
 */
export async function freshCountedDb(): Promise<{ db: Db; queries: DbQueryCounter }> {
  const log: string[] = [];
  const wrap: LibSqlWrap = (client) => countingClient(client, log);
  const db = await createDb(":memory:", wrap);
  await pushLiveSchema(db);
  log.length = 0; // the schema push isn't the test's budget
  return {
    db,
    queries: {
      count: (): number => log.length,
      statements: (): readonly string[] => [...log],
      reset: (): void => {
        log.length = 0;
      },
    },
  };
}

// The instrumented method set — mirrors observability's wrapLibSqlClient exactly (the production seam).
const INSTRUMENTED = new Set(["execute", "batch", "executeMultiple", "transaction"]);

function sqlOf(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg !== null && typeof arg === "object" && "sql" in arg) {
    return String((arg as { sql?: string }).sql ?? "?");
  }
  return "?";
}

/** Proxy wrap mirroring observability's `wrapLibSqlClient`: non-instrumented methods are BOUND TO THE
 *  TARGET (libSQL's Sqlite3Client uses TC39 private fields that throw if invoked with the Proxy as
 *  `this`); instrumented ones log then delegate. Generic so this file never imports `@libsql/client`
 *  (not a root dependency — the same reason observability's wrapper is generic). */
function countingClient<T extends object>(client: T, log: string[]): T {
  return new Proxy(client, {
    get(target, prop): unknown {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function" || typeof prop !== "string") {
        return value;
      }
      if (!INSTRUMENTED.has(prop)) {
        return value.bind(target); // bind-to-target so private fields survive
      }
      return (...args: unknown[]): unknown => {
        if (prop === "batch" && Array.isArray(args[0])) {
          for (const stmt of args[0] as unknown[]) {
            log.push(sqlOf(stmt));
          }
        } else if (prop === "transaction") {
          log.push("(interactive transaction — inner statements not counted)");
        } else {
          log.push(sqlOf(args[0]));
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
