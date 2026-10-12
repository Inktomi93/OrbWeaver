// support/db — self-test for freshCountedDb (the query-budget counter) AND freshHeldDb/holdingClient (the
// statement fence). Proves: the counter's window opens EMPTY (the schema push is not the test's budget),
// each execute counts once with its SQL recorded, a `db.batch` counts per statement, reset() reopens the
// window, and the FENCE itself reaches a statement issued through `db.batch` (#1549) rather than hanging
// to the vitest timeout. Runs against the real proxied libSQL client — the same `LibSqlWrap` seam
// production uses for OTel.

import { users } from "@orb/db";
import { freshCountedDb, freshHeldDb } from "./db.ts";
import { makeUser } from "./factories/user.ts";
import { expect, test } from "./fixtures.ts";

const INSERT_SQL = /insert into/iu;
const SELECT_SQL = /select/iu;

/** A short race against the gate's `reached` promise — the honest way to prove "this resolved" without
 *  actually waiting out a 5s vitest timeout when it doesn't (#1549's pre-fix symptom). */
const TIMEOUT_TOKEN = Symbol("timeout");
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT_TOKEN> {
  return Promise.race([promise, new Promise<typeof TIMEOUT_TOKEN>((resolve) => setTimeout(() => resolve(TIMEOUT_TOKEN), ms))]);
}

test("the counter window opens empty — the schema push is excluded", async () => {
  const { queries } = await freshCountedDb();
  expect(queries.count()).toBe(0);
  expect(queries.statements()).toEqual([]);
});

test("each statement counts once and records its SQL text", async () => {
  const { db, queries } = await freshCountedDb();
  await db.insert(users).values(makeUser());
  expect(queries.count()).toBe(1);
  expect(queries.statements()[0]).toMatch(INSERT_SQL);

  await db.select().from(users);
  expect(queries.count()).toBe(2);
  expect(queries.statements()[1]).toMatch(SELECT_SQL);
});

test("db.batch counts each inner statement (a budget can see through batching)", async () => {
  const { db, queries } = await freshCountedDb();
  await db.batch([db.insert(users).values(makeUser()), db.insert(users).values(makeUser())]);
  expect(queries.count()).toBe(2);
});

test("reset() reopens the window", async () => {
  const { db, queries } = await freshCountedDb();
  await db.insert(users).values(makeUser());
  queries.reset();
  expect(queries.count()).toBe(0);
  await db.select().from(users);
  expect(queries.count()).toBe(1);
});

// ── freshHeldDb's fence, and the plane a hold must reach (#1549) ─────────────────────────────────────

test("a hold on a plain execute() reaches, holds, and releases normally", async () => {
  const { db, hold } = await freshHeldDb();
  const gate = hold(INSERT_SQL);
  // `db.insert(...).values(...)` is a LAZY thenable — nothing is issued until something subscribes via
  // `.then()`/`await`. `Promise.resolve(...)` kicks it off on the next microtask without waiting it out.
  const write = Promise.resolve(db.insert(users).values(makeUser()));
  expect(await raceTimeout(gate.reached, 300)).not.toBe(TIMEOUT_TOKEN);
  gate.release();
  await write;
});

test("a hold on a statement issued INSIDE db.batch is fenced too — the batch is one atomic unit (#1549)", async () => {
  const { db, hold } = await freshHeldDb();
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
  const { db, hold } = await freshHeldDb();
  const gate = hold(INSERT_SQL, 1);
  const write = db.batch([db.select().from(users), db.insert(users).values(makeUser())]);
  expect(await raceTimeout(gate.reached, 300)).not.toBe(TIMEOUT_TOKEN);
  gate.release();
  await write;
  expect(await db.select().from(users)).toHaveLength(1);
});
