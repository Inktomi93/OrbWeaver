import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  insertUser,
  selectForProvisionByExternalId,
  selectForProvisionByHandle,
  selectIdByHandle,
  updateUser,
} from "../../../../../packages/server/src/domain/sessions/persistence/users";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";

const T0 = 1_750_000_000_000;
const ALICE = castId<UserId>("user_alice");
const HANDLE = castId<Handle>("alice");
const EXTERNAL = castId<ExternalId>("authentik|abc");

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

async function seedAlice(): Promise<void> {
  await insertUser(db, {
    id: ALICE,
    handle: HANDLE,
    externalId: EXTERNAL,
    role: "user",
    enabled: true,
    createdAt: T0,
    updatedAt: T0,
  });
}

describe("persistence/users", () => {
  test("insertUser + selectIdByHandle round-trips the row id", async () => {
    await seedAlice();
    expect(await selectIdByHandle(db, HANDLE)).toBe(ALICE);
  });

  test("selectIdByHandle returns undefined for an unknown handle", async () => {
    expect(await selectIdByHandle(db, castId<Handle>("ghost"))).toBeUndefined();
  });

  test("insertUser is race-tolerant (onConflictDoNothing — no overwrite, no throw)", async () => {
    await seedAlice();
    await insertUser(db, {
      id: castId<UserId>("user_other"),
      handle: HANDLE,
      externalId: null,
      role: "owner",
      enabled: true,
      createdAt: T0,
      updatedAt: T0,
    });
    const row = (await db.select().from(users).where(eq(users.handle, HANDLE)))[0];
    expect(row?.id).toBe(ALICE);
    expect(row?.role).toBe("user");
  });

  test("provision lookups (by external id, by handle) return the resolution columns", async () => {
    await seedAlice();
    const byExternal = await selectForProvisionByExternalId(db, EXTERNAL);
    const byHandle = await selectForProvisionByHandle(db, HANDLE);
    expect(byExternal).toStrictEqual({
      id: ALICE,
      handle: HANDLE,
      externalId: EXTERNAL,
      role: "user",
      enabled: true,
    });
    expect(byHandle).toStrictEqual(byExternal);
  });

  test("updateUser patches only the supplied columns", async () => {
    await seedAlice();
    await updateUser(db, ALICE, { handle: castId<Handle>("renamed"), updatedAt: T0 + 1 });
    const row = (await db.select().from(users).where(eq(users.id, ALICE)))[0];
    expect(row?.handle).toBe("renamed");
    expect(row?.role).toBe("user");
    expect(row?.enabled).toBe(true);
  });
});
