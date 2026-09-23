// tests/support/db — freshDb (docs/law/Spine-Testing.md §2): a libSQL `:memory:` db per call for the `.int` lane.
// freshDb PUSHES the LIVE schema (it diffs `@orb/db/schema` against an empty snapshot via drizzle-kit's
// programmatic API and applies the resulting CREATE statements over the real createDb handle), so a slice
// test always runs against the current schema regardless of whether `0000_baseline.sql` has been
// regenerated yet — fast + drift-proof for per-table tests. The committed baseline + the `runMigrations`
// FK-dance + `assertReferentialIntegrity`'s throw path are covered by `tests/db/client.int.test.ts`, and
// the committed baseline ↔ schema equivalence by `tests/tooling/verify/ops/db-baseline-parity.int.test.ts`.
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
    await db.run(sql.raw(statement));
  }
}

/** A fresh in-memory db with the full schema applied (FK enforcement ON, via createDb). */
export async function freshDb(): Promise<Db> {
  const db = await createDb(":memory:");
  await pushLiveSchema(db);
  return db;
}

interface StatementGate {
  readonly pattern: RegExp;
  remaining: number;
  readonly reached: PromiseWithResolvers<void>;
  readonly released: PromiseWithResolvers<void>;
}

export interface HeldStatement {
  /** Resolves only after every expected statement reached the real libSQL client wrapper. */
  readonly reached: Promise<void>;
  /** Let the held statements enter the real driver. */
  readonly release: () => void;
}

export interface HeldDb {
  readonly db: Db;
  /** Hold the next `arrivals` statements whose SQL matches `pattern`. Only one hold may be armed at once. */
  readonly hold: (pattern: RegExp, arrivals?: number) => HeldStatement;
}

/**
 * A real freshDb whose libSQL wrapper can hold one statement class before it enters the driver. Tests use
 * this to make read-then-write races deterministic: both requests finish their reads, the matching writes
 * park here, then the test releases them together. The database, schema, and statements are all real.
 */
export async function freshHeldDb(): Promise<HeldDb> {
  let active: StatementGate | undefined;
  const wrap: LibSqlWrap = (client) => holdingClient(client, () => active);
  const db = await createDb(":memory:", wrap);
  await pushLiveSchema(db);
  return {
    db,
    hold: (pattern: RegExp, arrivals = 1): HeldStatement => {
      if (active !== undefined) {
        throw new Error("a DB statement hold is already armed");
      }
      if (arrivals < 1) {
        throw new Error("a DB statement hold needs at least one arrival");
      }
      const gate: StatementGate = {
        pattern,
        remaining: arrivals,
        reached: Promise.withResolvers<void>(),
        released: Promise.withResolvers<void>(),
      };
      active = gate;
      return {
        reached: gate.reached.promise,
        release: (): void => {
          if (active === gate) {
            active = undefined;
          }
          gate.released.resolve();
        },
      };
    },
  };
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

/** A regex's `lastIndex` survives across calls when it carries the `g`/`y` flag — reset it on both sides
 *  of a test so a caller's own `/pattern/g` cannot silently start matching from the wrong offset. */
function gateMatches(gate: StatementGate, sqlText: string): boolean {
  gate.pattern.lastIndex = 0;
  const hit = gate.pattern.test(sqlText);
  gate.pattern.lastIndex = 0;
  return hit;
}

/** Advance `gate` by `arrivals` matched statements and return the promise the call should await before
 *  actually entering the driver — the shared tail of both `execute` and `batch`'s held path. */
function parkOnGate(gate: StatementGate, arrivals: number): Promise<void> {
  gate.remaining -= arrivals;
  if (gate.remaining <= 0) {
    gate.reached.resolve();
  }
  return gate.released.promise;
}

function heldExecute<T extends object>(target: T, value: (...a: unknown[]) => unknown, current: () => StatementGate | undefined) {
  return (...args: unknown[]): unknown => {
    const gate = current();
    if (gate === undefined || !gateMatches(gate, sqlOf(args[0]))) {
      return value.apply(target, args);
    }
    return parkOnGate(gate, 1).then(() => value.apply(target, args));
  };
}

/** A libSQL batch is intercepted as ONE UNIT, never per inner statement: it is the atomic write this
 *  house's own law names it (`batch-is-the-only-atomic-unit-and-it-bans-read-first`) — there is no way to
 *  let a batch's non-matching statements through while holding only the matching one, so a hold that
 *  matches ANY statement inside the array parks the WHOLE call. */
function heldBatch<T extends object>(target: T, value: (...a: unknown[]) => unknown, current: () => StatementGate | undefined) {
  return (...args: unknown[]): unknown => {
    const gate = current();
    const statements = Array.isArray(args[0]) ? (args[0] as readonly unknown[]) : [];
    const matches = gate === undefined ? 0 : statements.filter((stmt) => gateMatches(gate, sqlOf(stmt))).length;
    if (gate === undefined || matches === 0) {
      return value.apply(target, args);
    }
    return parkOnGate(gate, matches).then(() => value.apply(target, args));
  };
}

/** Proxy shape mirrors {@link countingClient}: bind all private-field methods to the target and intercept
 *  `execute` AND `batch` — the two planes a real statement can arrive on (#1549). A held invocation has
 *  not entered SQLite yet, so unrelated statements can establish the exact mid-race state before release.
 *  Before this, only `execute` was intercepted: a hold armed for a statement that only ever runs inside
 *  `db.batch` (a common `refinery`/`chat` write shape) never saw it — `execute` never fired,
 *  `gate.remaining` never decremented, and the pin hung to the 5s vitest timeout instead of fencing
 *  anything, which reads as "flaky", not "the fence is on the wrong plane". */
function holdingClient<T extends object>(client: T, current: () => StatementGate | undefined): T {
  return new Proxy(client, {
    get(target, prop): unknown {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function" || typeof prop !== "string") {
        return value;
      }
      if (prop === "execute") {
        return heldExecute(target, value as (...a: unknown[]) => unknown, current);
      }
      if (prop === "batch") {
        return heldBatch(target, value as (...a: unknown[]) => unknown, current);
      }
      return value.bind(target);
    },
  });
}
