// Mirror int-test for domain/settings/persistence/seed-ledger — the per-account seed ledger (ADR 0261). A recorded
// key reads back, a second record keeps the first time, and one account's keys never reach another's.

import type { Db } from "@orb/db";
import { userSeedLedger } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach } from "vitest";
import { listSeededItemKeys, recordSeededItemKeys } from "../../../../../packages/server/src/domain/settings/persistence/seed-ledger.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

let db: Db;
let owner: UserId;
let friend: UserId;

beforeEach(async () => {
  db = await freshDb();
  owner = (await seedUser(db)).id;
  friend = (await seedUser(db)).id;
});

test("a recorded key reads back for its account only", async () => {
  await recordSeededItemKeys(db, owner, ["character:niko", "roster:pair"], 1000);
  expect([...(await listSeededItemKeys(db, owner))].toSorted()).toEqual(["character:niko", "roster:pair"]);
  expect(await listSeededItemKeys(db, friend)).toEqual([]);
});

test("recording a key twice keeps one row and its first time; an empty record writes nothing", async () => {
  await recordSeededItemKeys(db, owner, ["character:niko"], 1000);
  await recordSeededItemKeys(db, owner, ["character:niko"], 2000);
  await recordSeededItemKeys(db, owner, [], 3000);
  const rows = await db.select().from(userSeedLedger).where(eq(userSeedLedger.userId, owner));
  expect(rows).toEqual([{ userId: owner, itemKey: "character:niko", seededAt: 1000 }]);
});
