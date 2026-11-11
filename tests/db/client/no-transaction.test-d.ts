// `db.transaction` is banned (.claude/rules/db.md): the handle every caller holds has no such member, so a call fails
// tsc, while the batch that is the one atomic unit stays callable.
// @subject packages/db/src/client/index.ts

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { batchMany } from "@orb/db/query";
import { expectTypeOf, test } from "vitest";

declare const db: Db;

test("the handle runs a batch and has no transaction", async () => {
  expectTypeOf(db.batch(batchMany([db.delete(users)]))).toExtend<Promise<readonly unknown[]>>();

  // @ts-expect-error db.transaction is banned; batchMany is the atomic unit
  await db.transaction(async () => {
    await db.delete(users);
  });
});
