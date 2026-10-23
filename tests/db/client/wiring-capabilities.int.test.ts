import { closeDb, users } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany } from "@orb/db/query";
import { databaseHandle } from "@orb/db/wiring-driver";
import {
  awaitableStatementForOwner,
  awaitableStatementToken,
  batchForOwner,
  batchHandle,
  databaseForOwner,
  statementForOwner,
  statementToken,
} from "@orb/db/wiring-owner";
import { expect, test } from "@orb/testkit/node";
import { freshDb } from "@orb/testkit/node/composed";
import { makeUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

test("wiring handles are distinct inert identities and retain the borrowed physical connection", async () => {
  const first = await freshDb();
  try {
    const second = await freshDb();
    try {
      const handle = databaseHandle(first);
      const other = databaseHandle(second);
      expect(handle).not.toBe(first);
      expect(handle).not.toBe(other);
      expect(Object.isFrozen(handle)).toBe(true);
      expect(Object.getPrototypeOf(handle)).toBe(Object.prototype);
      for (const name of [
        "select",
        "query",
        "insert",
        "update",
        "delete",
        "run",
        "get",
        "all",
        "values",
        "execute",
        "executeMultiple",
        "batch",
        "transaction",
        "$client",
        "then",
      ]) {
        expect(Reflect.has(handle, name), name).toBe(false);
      }
      expect(databaseForOwner(handle)).toBe(first);
      expect(databaseForOwner(other)).toBe(second);
      expect(() => databaseForOwner({ ...handle })).toThrow("database wiring handle is not registered");
      await databaseForOwner(handle).run(sql`PRAGMA user_version=73`);
      expect(await first.get(sql`PRAGMA user_version`)).toEqual({ ["user_version"]: 73 });
      expect(await second.get(sql`PRAGMA user_version`)).toEqual({ ["user_version"]: 0 });
    } finally {
      closeDb(second);
    }
  } finally {
    closeDb(first);
  }
});

test("statement tokens neither assimilate nor rebuild a native awaitable statement", async () => {
  const db = await freshDb();
  try {
    const user = makeUser();
    const statement = db.insert(users).values(user).returning({ id: users.id });
    const token = awaitableStatementToken(statement);
    expect(Object.isFrozen(token)).toBe(true);
    for (const name of ["then", "execute", "run", "getSQL", "prepare", "$client"]) {
      expect(Reflect.has(token, name), name).toBe(false);
    }
    expect(await Promise.resolve(token)).toBe(token);
    expect(await db.select().from(users)).toEqual([]);
    expect(statementForOwner(token)).toBe(statement);
    expect(awaitableStatementForOwner(token)).toBe(statement);
    expect(() => statementForOwner({ ...token })).toThrow("statement wiring token is not registered");
    expect(() => awaitableStatementForOwner({ ...token })).toThrow("awaitable statement wiring token is not registered");
    expect(await awaitableStatementForOwner(token)).toEqual([{ id: user.id }]);
    expect(await db.select().from(users)).toEqual([user]);
  } finally {
    closeDb(db);
  }
});

test("batch tokens preserve the exact mutable operand, statement identity and atomic rollback", async () => {
  const db = await freshDb();
  try {
    const first = makeUser();
    const duplicate = makeUser({ handle: first.handle, handleKey: first.handleKey });
    const statement = db.insert(users).values(first);
    const token = statementToken(statement);
    const batch: BatchStmt[] = [];
    const handle = batchHandle(batch);
    expect(batchForOwner(handle)).toBe(batch);
    expect(Object.isFrozen(handle)).toBe(true);
    expect(() => batchForOwner({ ...handle })).toThrow("batch wiring handle is not registered");
    expect(await db.batch(batchMany(batchForOwner(handle)))).toEqual([]);
    batchForOwner(handle).push(statementForOwner(token));
    expect(batch[0]).toBe(statement);
    batch.push(db.insert(users).values(duplicate));
    await expect(db.batch(batchMany(batchForOwner(handle)))).rejects.toThrow();
    expect(await db.select().from(users)).toEqual([]);
    batch.pop();
    await db.batch(batchMany(batchForOwner(handle)));
    expect(await db.select().from(users)).toEqual([first]);
  } finally {
    closeDb(db);
  }
});
