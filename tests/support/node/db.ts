// tests/support/node/db — freshDb (docs/law/Spine-Testing.md §2): a libSQL `:memory:` db per call for the `.int` lane.
// freshDb PUSHES the LIVE schema (it diffs `@orb/db/schema` against an empty snapshot via drizzle-kit's
// programmatic API and applies the resulting CREATE statements over the real createDb handle), so a slice
// test always runs against the current schema — fast for per-table tests. That the push equals the schema
// `runMigrations(db, SHIPPED_MIGRATIONS)` builds is covered by `tests/support/node/db.int.test.ts`.
//
// freshCountedDb adds a QUERY-BUDGET counter over the same handle: the counting proxy rides `createDb`'s
// `LibSqlWrap` seam — the SAME seam `foundation/observability`'s `wrapLibSqlClient` uses for OTel spans
// in production — so what a budget test counts is exactly what shows up as `db.*` spans at runtime.

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db, LibSqlWrap } from "@orb/db";
import { closeDb, createDb, preCloseHousekeeping } from "@orb/db";
// biome-ignore lint/performance/noNamespaceImport: drizzle-kit's snapshot API takes the whole schema module as a Record — namespace import is the canonical way to pass every table.
import * as schema from "@orb/db/schema";
import { isPlainObject } from "@orb/kit/guards";
import { jsonValueSchema } from "@orb/kit/json";
import type { DrizzleSQLiteSnapshotJSON } from "drizzle-kit/api";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { workerOnce } from "./worker-once.ts";

// drizzle-kit's API bundle assigns helper methods onto `Array.prototype` and `String.prototype` as enumerable
// properties when it loads. A built-in prototype has no enumerable members, so whatever is enumerable there leaked.
// pdfjs refuses to run in a realm where `for...in` over an array yields a key, so the pdf loader failed in every
// composed root, which imports this module. Production never loads drizzle-kit, so only the test world hides them.
// The sweep sits in this module's body, after the static drizzle-kit import above has evaluated.
for (const prototype of [Array.prototype, String.prototype]) {
  for (const name of Object.keys(prototype)) {
    Object.defineProperty(prototype, name, { enumerable: false });
  }
}

// The diff depends only on the schema module, so a worker generates it once and every freshDb applies it.
const liveSchemaStatements = workerOnce(
  async (): Promise<string[]> => await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema)),
);

/** Make the next schema generation reject with `error`, so a case can show the generation after it runs again. */
export const __failNextSchemaGenerationForTest = liveSchemaStatements.__failNextForTest;

/** Diff the live schema against empty and apply the CREATE statements (see the header). */
async function pushLiveSchema(db: Db): Promise<void> {
  for (const statement of await liveSchemaStatements.read()) {
    await db.run(sql.raw(statement));
  }
}

/** The shipped migration chain, relative to the repo root the test runner starts in. */
export const SHIPPED_MIGRATIONS = "packages/db/src/migrations";

interface ShippedJournal {
  readonly journal: Record<string, unknown>;
  readonly entries: readonly unknown[];
}

/** The migration journal under `chainDir`, parsed once for every reader of it. */
async function readJournal(chainDir: string): Promise<ShippedJournal> {
  const journal = jsonValueSchema.parse(JSON.parse(await readFile(join(chainDir, "meta", "_journal.json"), "utf8")));
  if (journal === null || typeof journal !== "object" || Array.isArray(journal) || !Array.isArray(journal["entries"])) {
    throw new Error("shipped migration journal has no entries");
  }
  return { journal, entries: journal["entries"] };
}

const tagOf = (entry: unknown): unknown => (entry !== null && typeof entry === "object" && "tag" in entry ? entry.tag : undefined);

/** A drizzle-kit SQLite snapshot: what `generate` writes beside each migration and diffs the next one from. */
export type SchemaSnapshot = DrizzleSQLiteSnapshotJSON;

const SNAPSHOT_SUFFIX = "_snapshot.json";
const TAG_NUMBER_SEPARATOR = "_";
const SQLITE_DIALECT = "sqlite";
const schemaSnapshotSchema = z.custom<SchemaSnapshot>(
  (value) => isPlainObject(value) && value["dialect"] === SQLITE_DIALECT && isPlainObject(value["tables"]),
  "not a drizzle-kit SQLite snapshot",
);

/** The snapshot of the newest migration in `chainDir`: the schema the next `drizzle-kit generate` diffs from. Its
 *  file carries the tag's number, as drizzle-kit names it. */
export async function latestSchemaSnapshot(chainDir: string = SHIPPED_MIGRATIONS): Promise<SchemaSnapshot> {
  const tag = tagOf((await readJournal(chainDir)).entries.at(-1));
  if (typeof tag !== "string") {
    throw new Error("migration journal has no newest entry");
  }
  const [number] = tag.split(TAG_NUMBER_SEPARATOR, 1);
  return schemaSnapshotSchema.parse(JSON.parse(await readFile(join(chainDir, "meta", `${number}${SNAPSHOT_SUFFIX}`), "utf8")));
}

/** The statements drizzle-kit generates from `snapshot` to the live schema: none when the snapshot already holds it. */
export async function schemaStatementsSince(snapshot: SchemaSnapshot): Promise<readonly string[]> {
  return await generateSQLiteMigration(snapshot, await generateSQLiteDrizzleJson(schema));
}

/** A temporary copy of the shipped chain that stops before `tag`, so a forward-migration test can build rows
 *  at the schema the migration upgrades from. Disposing removes the copy. */
export async function migrationsBefore(tag: string): Promise<AsyncDisposable & { readonly path: string }> {
  const path = await mkdtemp(join(tmpdir(), "orb-migrations-before-"));
  try {
    await cp(SHIPPED_MIGRATIONS, path, { recursive: true });
    const { journal, entries } = await readJournal(path);
    const index = entries.findIndex((entry) => tagOf(entry) === tag);
    if (index < 1) {
      throw new Error(`migration ${tag} has no preceding chain`);
    }
    await writeFile(join(path, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: entries.slice(0, index) }));
    return { path, [Symbol.asyncDispose]: () => rm(path, { recursive: true, force: true }) };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}

/** The shipped chain with one migration held back, for a suite that needs today's services over rows from before
 *  `tag`. `paths.rest` is every other migration in order; `paths.held` is `tag` alone, stamped after the rest so the production
 *  migrator applies it last. A chain cut before `tag` also drops every later migration, and services read the tables
 *  those add. The held migration then runs later than it shipped, which is the same only while no later migration
 *  touches the tables it rewrites. Disposing removes both copies. */
export async function migrationsHolding(tag: string): Promise<AsyncDisposable & { readonly paths: { readonly rest: string; readonly held: string } }> {
  const root = await mkdtemp(join(tmpdir(), "orb-migrations-holding-"));
  try {
    const rest = join(root, "rest");
    const held = join(root, "held");
    await cp(SHIPPED_MIGRATIONS, rest, { recursive: true });
    await cp(SHIPPED_MIGRATIONS, held, { recursive: true });
    const { journal, entries } = await readJournal(rest);
    const entry = entries.find((candidate) => tagOf(candidate) === tag);
    const last = Math.max(...entries.map((candidate) => (isPlainObject(candidate) && typeof candidate["when"] === "number" ? candidate["when"] : 0)));
    if (!isPlainObject(entry)) {
      throw new Error(`migration ${tag} is not in the shipped chain`);
    }
    await writeFile(join(rest, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: entries.filter((candidate) => candidate !== entry) }));
    await writeFile(join(held, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: [{ ...entry, idx: 0, when: last + 1 }] }));
    return { paths: { rest, held }, [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

/** {@link migrationsBefore} the newest shipped migration: the chain a database holds just before the latest one runs. */
export async function migrationsBeforeLatest(): Promise<AsyncDisposable & { readonly path: string }> {
  const latest = tagOf((await readJournal(SHIPPED_MIGRATIONS)).entries.at(-1));
  if (typeof latest !== "string") {
    throw new Error("shipped migration journal has no newest entry");
  }
  return await migrationsBefore(latest);
}

/** A database with exactly one owner: disposing it closes the connection. Declare it with `using` before the graph
 *  that borrows `db`, so the graph closes first. */
export interface OwnedDb extends Disposable {
  // Spelled through `closeDb`'s parameter because Biome cannot resolve that spelling: typed `Db`, the member reaches libsql's `InArgs` union and useDisposables goes silent on every acquisition.
  readonly db: Parameters<typeof closeDb>[0];
}

/** Give a {@link createDb} handle its owner, in the same expression that opens it. */
export function ownDb(db: Db): OwnedDb {
  return { db, [Symbol.dispose]: () => closeDb(db) };
}

/** A file-backed database with exactly one owner: disposing it truncates the WAL and closes, so the file is whole for the next reader. */
export interface OwnedFileDb extends AsyncDisposable {
  // Spelled through `closeDb` for the reason on {@link OwnedDb}.
  readonly db: Parameters<typeof closeDb>[0];
}

/** Give a file-backed {@link createDb} handle its owner, in the same expression that opens it. */
export function ownFileDb(db: Db): OwnedFileDb {
  return { db, [Symbol.asyncDispose]: () => preCloseHousekeeping(db) };
}

/** A fresh in-memory db with the full schema applied (FK enforcement ON, via createDb). */
export function freshDb(wrap?: LibSqlWrap): Promise<OwnedDb> {
  return prepareFreshDb(wrap);
}

async function prepareFreshDb(wrap?: LibSqlWrap): Promise<OwnedDb> {
  const db = await createDb(":memory:", wrap);
  try {
    await pushLiveSchema(db);
    return ownDb(db);
  } catch (err) {
    closeDb(db);
    throw err;
  }
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
  /** Stop matching new arrivals: statements already parked stay parked until {@link release}, later ones pass.
   *  A race needs this when the competing request runs the same SQL as the held one. */
  readonly disarm: () => void;
}

export interface HeldDb extends OwnedDb {
  /** Hold the next `arrivals` statements whose SQL matches `pattern`. Only one hold may be armed at once. */
  readonly hold: (pattern: RegExp, arrivals?: number) => HeldStatement;
}

export interface DbStatementHold extends Pick<HeldDb, "hold"> {
  readonly wrap: LibSqlWrap;
}

/**
 * A real freshDb whose libSQL wrapper can hold one statement class before it enters the driver. Tests use
 * this to make read-then-write races deterministic: both requests finish their reads, the matching writes
 * park here, then the test releases them together. The database, schema, and statements are all real.
 */
export async function freshHeldDb(): Promise<HeldDb> {
  const controller = createDbStatementHold();
  return { ...(await prepareFreshDb(controller.wrap)), hold: controller.hold };
}

/** Use the same physical statement fence with a migrated file DB or the fresh in-memory helper. */
export function createDbStatementHold(): DbStatementHold {
  let active: StatementGate | undefined;
  const wrap: LibSqlWrap = (client) => holdingClient(client, () => active);
  return {
    wrap,
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
        disarm: (): void => {
          if (active === gate) {
            active = undefined;
          }
        },
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

export interface CountedDb extends OwnedDb {
  readonly queries: DbQueryCounter;
}

interface DbQueryCounter {
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
export async function freshCountedDb(): Promise<CountedDb> {
  const log: string[] = [];
  const wrap: LibSqlWrap = (client) => countingClient(client, log);
  const queries: DbQueryCounter = {
    count: (): number => log.length,
    statements: (): readonly string[] => [...log],
    reset: (): void => {
      log.length = 0;
    },
  };
  return await prepareFreshDb(wrap).then((owned) => {
    queries.reset(); // the schema push isn't the test's budget
    return { ...owned, queries };
  });
}

// The instrumented method set — mirrors observability's wrapLibSqlClient exactly (the production seam).
const INSTRUMENTED = new Set(["execute", "batch", "executeMultiple", "transaction"]);

function sqlOf(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg !== null && typeof arg === "object" && "sql" in arg) {
    return typeof arg.sql === "string" ? arg.sql : "?";
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
          for (const stmt of args[0]) {
            log.push(sqlOf(stmt));
          }
        } else if (prop === "transaction") {
          log.push("(interactive transaction — inner statements not counted)");
        } else {
          log.push(sqlOf(args[0]));
        }
        return Reflect.apply(value, target, args);
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

function heldExecute(invoke: (args: unknown[]) => unknown, current: () => StatementGate | undefined) {
  return (...args: unknown[]): unknown => {
    const gate = current();
    if (gate === undefined || !gateMatches(gate, sqlOf(args[0]))) {
      return invoke(args);
    }
    return parkOnGate(gate, 1).then(() => invoke(args));
  };
}

/** A libSQL batch is intercepted as ONE UNIT, never per inner statement: it is the atomic write this
 *  house's own law names it (`batch-is-the-only-atomic-unit-and-it-bans-read-first`) — there is no way to
 *  let a batch's non-matching statements through while holding only the matching one, so a hold that
 *  matches ANY statement inside the array parks the WHOLE call. */
function heldBatch(invoke: (args: unknown[]) => unknown, current: () => StatementGate | undefined) {
  return (...args: unknown[]): unknown => {
    const gate = current();
    const statements = Array.isArray(args[0]) ? args[0] : [];
    const matches = gate === undefined ? 0 : statements.filter((stmt) => gateMatches(gate, sqlOf(stmt))).length;
    if (gate === undefined || matches === 0) {
      return invoke(args);
    }
    return parkOnGate(gate, matches).then(() => invoke(args));
  };
}

/** Proxy shape mirrors {@link countingClient}: bind all private-field methods to the target and intercept
 *  `execute` AND `batch` — the two planes a real statement can arrive on. A held invocation has
 *  not entered SQLite yet, so unrelated statements can establish the exact mid-race state before release.
 *  Intercepting only `execute` would miss a statement that only ever runs inside `db.batch`: the gate
 *  would never decrement and the pin would hang to the vitest timeout, which reads as "flaky", not "the
 *  fence is on the wrong plane". */
function holdingClient<T extends object>(client: T, current: () => StatementGate | undefined): T {
  return new Proxy(client, {
    get(target, prop): unknown {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function" || typeof prop !== "string") {
        return value;
      }
      if (prop === "execute") {
        return heldExecute((args) => Reflect.apply(value, target, args), current);
      }
      if (prop === "batch") {
        return heldBatch((args) => Reflect.apply(value, target, args), current);
      }
      return value.bind(target);
    },
  });
}
