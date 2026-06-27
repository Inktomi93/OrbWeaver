// foundation/observability/debug/inspect/stats — the backbone-table row counts against a real libSQL
// :memory: db. Asserts the labels are the schema table names (getTableName, drift-proof) and the counts
// reflect what's actually persisted: an empty db is all-zero; seeded rows bump exactly their table's count.

import { characters, chats, users } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { tableCounts } from "@orb/server/foundation/observability/debug";
import { getTableName } from "drizzle-orm";
import { freshDb } from "../../../../../support/db";
import { expect, test } from "../../../../../support/fixtures";

test("a fresh db reports zero for every backbone table (labels = schema names)", async () => {
  const db = await freshDb();
  const counts = await tableCounts(db);

  // Labels are the real schema table names — a rename can't silently drift them.
  expect(counts[getTableName(users)]).toBe(0);
  expect(counts[getTableName(chats)]).toBe(0);
  expect(counts[getTableName(characters)]).toBe(0);
  // Every counted table is present and zero (no undefined gaps).
  expect(Object.values(counts).every((n) => n === 0)).toBe(true);
});

test("counts reflect persisted rows — exactly the seeded tables bump", async () => {
  const db = await freshDb();
  const userId = castId<UserId>("user_stats");
  await db.insert(users).values({ id: userId, handle: castId<Handle>("user_stats") });
  await db.insert(chats).values({ id: castId<ChatId>("chat_stats_a") });
  await db.insert(chats).values({ id: castId<ChatId>("chat_stats_b") });
  await db.insert(characters).values({
    id: castId<CharacterId>("character_stats"),
    handle: "card-stats",
    ownerId: userId,
    contentHash: "hash-stats",
    name: "Stat",
  });

  const counts = await tableCounts(db);
  expect(counts[getTableName(users)]).toBe(1);
  expect(counts[getTableName(chats)]).toBe(2);
  expect(counts[getTableName(characters)]).toBe(1);
  // An untouched backbone table stays zero.
  expect(counts[getTableName(chats)]).not.toBe(counts["messages"]);
  expect(counts["messages"]).toBe(0);
});
