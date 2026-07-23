// Persistence layer for the global-variable plane — the owner-scoped query functions directly (the verbs
// wrap these; this pins the raw db behavior incl. the LIKE-prefix escaping).

import { describe } from "vitest";
import {
  deleteGlobalVariable,
  listGlobalVariables,
  selectGlobalVariable,
  upsertGlobalVariable,
} from "../../../../../packages/server/src/domain/automation/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { FIXED_NOW_MS, seedUser } from "../_support.ts";

describe("global_variables persistence", () => {
  test("upsert then select round-trips the value", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await upsertGlobalVariable(db, { ownerId: owner, key: "k", value: "v", updatedAt: FIXED_NOW_MS });
    await expect(selectGlobalVariable(db, owner, "k")).resolves.toBe("v");
  });

  test("select is owner-scoped (foreign owner → null)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    await upsertGlobalVariable(db, { ownerId: owner, key: "k", value: "v", updatedAt: FIXED_NOW_MS });
    await expect(selectGlobalVariable(db, other, "k")).resolves.toBeNull();
  });

  test("upsert overwrites value + updatedAt (last-write-wins)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await upsertGlobalVariable(db, { ownerId: owner, key: "k", value: "1", updatedAt: 1 });
    await upsertGlobalVariable(db, { ownerId: owner, key: "k", value: "2", updatedAt: 2 });
    const [row] = await listGlobalVariables(db, owner);
    expect(row).toEqual({ key: "k", value: "2", updatedAt: 2 });
  });

  test("delete is owner-scoped and idempotent", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await upsertGlobalVariable(db, { ownerId: owner, key: "k", value: "v", updatedAt: FIXED_NOW_MS });
    await deleteGlobalVariable(db, owner, "k");
    await deleteGlobalVariable(db, owner, "k"); // idempotent
    await expect(selectGlobalVariable(db, owner, "k")).resolves.toBeNull();
  });

  test("list escapes a `_` in the prefix (literal, not single-char wildcard)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await upsertGlobalVariable(db, { ownerId: owner, key: "a_b", value: "y", updatedAt: FIXED_NOW_MS });
    await upsertGlobalVariable(db, { ownerId: owner, key: "axb", value: "n", updatedAt: FIXED_NOW_MS });
    const keys = (await listGlobalVariables(db, owner, "a_")).map((v) => v.key);
    expect(keys).toEqual(["a_b"]);
  });
});
