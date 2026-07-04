// support/db — self-test for freshCountedDb (the query-budget counter). Proves: the window opens EMPTY
// (the schema push is not the test's budget), each execute counts once with its SQL recorded, a
// `db.batch` counts per statement, and reset() reopens the window. Runs against the real proxied libSQL
// client — the same `LibSqlWrap` seam production uses for OTel.

import { users } from "@orb/db";
import { freshCountedDb } from "./db.ts";
import { makeUser } from "./factories/user.ts";
import { expect, test } from "./fixtures.ts";

const INSERT_SQL = /insert into/iu;
const SELECT_SQL = /select/iu;

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
