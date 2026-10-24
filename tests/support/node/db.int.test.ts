// support/db — self-test for freshCountedDb (the query-budget counter) AND freshHeldDb/holdingClient (the
// statement fence). Proves: the counter's window opens EMPTY (the schema push is not the test's budget),
// each execute counts once with its SQL recorded, a `db.batch` counts per statement, reset() reopens the
// window, and the FENCE itself reaches a statement issued through `db.batch` rather than hanging
// to the vitest timeout. Runs against the real proxied libSQL client — the same `LibSqlWrap` seam
// production uses for OTel.

import type { Db } from "@orb/db";
import { closeDb, createDb, runMigrations, users } from "@orb/db";
import { sql } from "drizzle-orm";
import { freshCountedDb, freshDb, freshHeldDb, SHIPPED_MIGRATIONS } from "./db.ts";
import { makeUser } from "./factories/rows.ts";
import { expect, test } from "./fixtures.ts";

const INSERT_SQL = /insert into/iu;
const SELECT_SQL = /select/iu;

/** A short race against the gate's `reached` promise — the honest way to prove "this resolved" without
 *  actually waiting out a 5s vitest timeout when it doesn't. */
const TIMEOUT_TOKEN = Symbol("timeout");
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT_TOKEN> {
  return Promise.race([promise, new Promise<typeof TIMEOUT_TOKEN>((resolve) => setTimeout(() => resolve(TIMEOUT_TOKEN), ms))]);
}

// The scope's stack closes the handle the helper opened, so no case leaves a libSQL client behind.
async function countedDb(resources: AsyncDisposableStack): Promise<Awaited<ReturnType<typeof freshCountedDb>>> {
  const counted = await freshCountedDb();
  resources.defer(() => closeDb(counted.db));
  return counted;
}

async function heldDb(resources: AsyncDisposableStack): Promise<Awaited<ReturnType<typeof freshHeldDb>>> {
  const held = await freshHeldDb();
  resources.defer(() => closeDb(held.db));
  return held;
}

test("the handles a case opens close with its scope", async () => {
  const resources = new AsyncDisposableStack();
  const counted = await countedDb(resources);
  const held = await heldDb(resources);
  expect(await counted.db.select().from(users)).toEqual([]);
  expect(await held.db.select().from(users)).toEqual([]);
  await resources.disposeAsync();
  await expect(counted.db.select().from(users)).rejects.toThrow();
  await expect(held.db.select().from(users)).rejects.toThrow();
});

test("the counter window opens empty — the schema push is excluded", async () => {
  await using resources = new AsyncDisposableStack();
  const { queries } = await countedDb(resources);
  expect(queries.count()).toBe(0);
  expect(queries.statements()).toEqual([]);
});

test("each statement counts once and records its SQL text", async () => {
  await using resources = new AsyncDisposableStack();
  const { db, queries } = await countedDb(resources);
  await db.insert(users).values(makeUser());
  expect(queries.count()).toBe(1);
  expect(queries.statements()[0]).toMatch(INSERT_SQL);

  await db.select().from(users);
  expect(queries.count()).toBe(2);
  expect(queries.statements()[1]).toMatch(SELECT_SQL);
});

test("db.batch counts each inner statement (a budget can see through batching)", async () => {
  await using resources = new AsyncDisposableStack();
  const { db, queries } = await countedDb(resources);
  await db.batch([db.insert(users).values(makeUser()), db.insert(users).values(makeUser())]);
  expect(queries.count()).toBe(2);
});

test("reset() reopens the window", async () => {
  await using resources = new AsyncDisposableStack();
  const { db, queries } = await countedDb(resources);
  await db.insert(users).values(makeUser());
  queries.reset();
  expect(queries.count()).toBe(0);
  await db.select().from(users);
  expect(queries.count()).toBe(1);
});

// ── freshHeldDb's fence, and the plane a hold must reach ─────────────────────────────────────

test("a hold on a plain execute() reaches, holds, and releases normally", async () => {
  await using resources = new AsyncDisposableStack();
  const { db, hold } = await heldDb(resources);
  const gate = hold(INSERT_SQL);
  // `db.insert(...).values(...)` is a LAZY thenable — nothing is issued until something subscribes via
  // `.then()`/`await`. `Promise.resolve(...)` kicks it off on the next microtask without waiting it out.
  const write = Promise.resolve(db.insert(users).values(makeUser()));
  expect(await raceTimeout(gate.reached, 300)).not.toBe(TIMEOUT_TOKEN);
  gate.release();
  await write;
});

test("a hold on a statement issued INSIDE db.batch is fenced too — the batch is one atomic unit (#1549)", async () => {
  await using resources = new AsyncDisposableStack();
  const { db, hold } = await heldDb(resources);
  const gate = hold(INSERT_SQL, 2);
  const write = db.batch([db.insert(users).values(makeUser()), db.insert(users).values(makeUser())]);
  // Pre-fix, `holdingClient` intercepted `execute` only — a statement that only ever arrives through
  // `db.batch` never reached the gate, and this raced the vitest timeout instead of the gate.
  expect(await raceTimeout(gate.reached, 300)).not.toBe(TIMEOUT_TOKEN);
  const before = await db.select().from(users);
  expect(before).toHaveLength(0); // the batch's writes are still PARKED — nothing entered the driver yet
  gate.release();
  await write;
  const after = await db.select().from(users);
  expect(after).toHaveLength(2); // released together — a batch cannot be partially released
});

test("a batch with only SOME matching statements holds the WHOLE call, never a partial release", async () => {
  await using resources = new AsyncDisposableStack();
  const { db, hold } = await heldDb(resources);
  const gate = hold(INSERT_SQL, 1);
  const write = db.batch([db.select().from(users), db.insert(users).values(makeUser())]);
  expect(await raceTimeout(gate.reached, 300)).not.toBe(TIMEOUT_TOKEN);
  gate.release();
  await write;
  expect(await db.select().from(users)).toHaveLength(1);
});

test("disarm lets later matching statements through while the parked one stays parked until release", async () => {
  await using resources = new AsyncDisposableStack();
  const { db, hold } = await heldDb(resources);
  const gate = hold(INSERT_SQL);
  const parked = Promise.resolve(db.insert(users).values(makeUser()));
  expect(await raceTimeout(gate.reached, 300)).not.toBe(TIMEOUT_TOKEN);
  gate.disarm();
  await db.insert(users).values(makeUser());
  expect(await db.select().from(users)).toHaveLength(1); // the later insert passed; the parked one has not entered the driver
  gate.release();
  await parked;
  expect(await db.select().from(users)).toHaveLength(2);
});

// ── freshDb parity: the pushed schema is the schema the shipped chain builds ─────────────────────────

interface MasterRow {
  readonly type: string;
  readonly name: string;
  readonly tableName: string;
}
interface ColumnRow {
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly defaultValue: string | null;
  readonly pk: number;
  readonly hidden: number;
}
interface IndexRow {
  readonly name: string;
  readonly unique: number;
  readonly origin: string;
  readonly partial: number;
}
interface IndexColumnRow {
  readonly name: string | null;
  readonly desc: number;
}
interface ForeignKeyRow {
  readonly table: string;
  readonly from: string;
  readonly to: string | null;
  readonly onUpdate: string;
  readonly onDelete: string;
}

const SQLITE_INTERNAL = "sqlite_%";
const DRIZZLE_LEDGER = "__drizzle_migrations";

/** Every table, column, index, unique constraint and foreign key of `db`, one line each. Column position is
 *  left out on purpose: an ADD COLUMN migration appends where a push follows the declaration. */
async function schemaLines(db: Db): Promise<readonly string[]> {
  const lines: string[] = [];
  const objects = await db.all<MasterRow>(
    sql`SELECT type, name, tbl_name AS tableName FROM sqlite_master WHERE name NOT LIKE ${SQLITE_INTERNAL} AND name <> ${DRIZZLE_LEDGER} ORDER BY type, name`,
  );
  for (const { type, name, tableName } of objects) {
    lines.push(`${type} ${name} on ${tableName}`);
    if (type === "table") {
      lines.push(...(await tableLines(db, name)));
    }
  }
  return lines.toSorted();
}

async function tableLines(db: Db, table: string): Promise<readonly string[]> {
  const lines: string[] = [];
  const columns = await db.all<ColumnRow>(sql`SELECT name, type, "notnull", dflt_value AS defaultValue, pk, hidden FROM pragma_table_xinfo(${table})`);
  for (const c of columns) {
    lines.push(`  column ${table}.${c.name} ${c.type} notnull=${c.notnull} default=${c.defaultValue} pk=${c.pk} hidden=${c.hidden}`);
  }
  const keys = await db.all<ForeignKeyRow>(
    sql`SELECT "table", "from", "to", on_update AS onUpdate, on_delete AS onDelete FROM pragma_foreign_key_list(${table})`,
  );
  for (const f of keys) {
    lines.push(`  fk ${table}.${f.from} -> ${f.table}.${f.to} update=${f.onUpdate} delete=${f.onDelete}`);
  }
  for (const i of await db.all<IndexRow>(sql`SELECT name, "unique", origin, partial FROM pragma_index_list(${table})`)) {
    const members = await db.all<IndexColumnRow>(sql`SELECT name, "desc" FROM pragma_index_xinfo(${i.name}) WHERE key = 1 ORDER BY seqno`);
    // A unique constraint owns an auto-named index; the name carries no meaning, the columns do.
    const label = i.origin === "c" ? i.name : `${i.origin}-constraint`;
    lines.push(
      `  index ${table} ${label} unique=${i.unique} partial=${i.partial} (${members.map((m) => `${m.name}${m.desc === 1 ? " desc" : ""}`).join(", ")})`,
    );
  }
  return lines;
}

function differences(left: readonly string[], right: readonly string[]): readonly string[] {
  const inRight = new Set(right);
  const inLeft = new Set(left);
  return [...left.filter((line) => !inRight.has(line)).map((line) => `- ${line}`), ...right.filter((line) => !inLeft.has(line)).map((line) => `+ ${line}`)];
}

async function schemaPair(): Promise<{ readonly pushed: Db; readonly migrated: Db } & AsyncDisposable> {
  const stack = new AsyncDisposableStack();
  try {
    const pushed = await freshDb();
    stack.defer(() => closeDb(pushed));
    const migrated = await createDb(":memory:");
    stack.defer(() => closeDb(migrated));
    await runMigrations(migrated, SHIPPED_MIGRATIONS);
    const lifetime = stack.move();
    return { pushed, migrated, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
  } catch (error) {
    await stack.disposeAsync();
    throw error;
  }
}

test("freshDb's pushed schema equals the schema runMigrations builds from the shipped chain", async () => {
  await using pair = await schemaPair();
  const pushed = await schemaLines(pair.pushed);
  expect(pushed.length).toBeGreaterThan(100);
  expect(differences(pushed, await schemaLines(pair.migrated))).toEqual([]);
});

test("the parity comparison reports a planted extra column, extra index and missing table", async () => {
  await using pair = await schemaPair();
  const baseline = await schemaLines(pair.migrated);
  await pair.pushed.run(sql`ALTER TABLE users ADD COLUMN planted_drift text`);
  await pair.pushed.run(sql`CREATE INDEX planted_drift_idx ON users (planted_drift)`);
  const drifted = differences(await schemaLines(pair.pushed), baseline);
  expect(drifted).toContainEqual(expect.stringContaining("users.planted_drift"));
  expect(drifted).toContainEqual(expect.stringContaining("planted_drift_idx"));

  await pair.pushed.run(sql`DROP INDEX planted_drift_idx`);
  await pair.pushed.run(sql`ALTER TABLE users DROP COLUMN planted_drift`);
  await pair.pushed.run(sql`DROP TABLE settings`);
  expect(differences(await schemaLines(pair.pushed), baseline)).toContainEqual("+ table settings on settings");
});
