// persistence/activity — the per-character reply timeline behind momentum: assistant replies per
// (character, UTC quarter-hour), D18 membership-scoped and husk-excluding.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { statsBucketStart } from "@orb/kit/stats-tally";
import { CALENDAR_BUCKET_MS } from "@orb/kit/time";
import { beforeEach, describe } from "vitest";
import { readMomentumBuckets } from "../../../../../packages/server/src/domain/stats/persistence/activity.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedMessage, seedUser, T0 } from "../_support.ts";

let db: Db;
let ownerId: UserId;
let characterId: CharacterId;

beforeEach(async () => {
  db = await freshDb();
  ownerId = await seedUser(db);
  characterId = await seedCharacter(db, ownerId, { name: "Aria" });
});

describe("readMomentumBuckets", () => {
  test("counts assistant replies per character and UTC quarter-hour; user turns are not replies", async () => {
    const chatId = await seedChat(db, characterId);
    const bucket = statsBucketStart(T0);
    await seedMessage(db, { chatId, seq: 1, role: "user", createdAt: bucket, variants: [{ content: "hi" }] });
    await seedMessage(db, { chatId, seq: 2, role: "assistant", characterId, createdAt: bucket, variants: [{ content: "a" }] });
    await seedMessage(db, { chatId, seq: 3, role: "assistant", characterId, createdAt: bucket + CALENDAR_BUCKET_MS - 1, variants: [{ content: "b" }] });
    await seedMessage(db, { chatId, seq: 4, role: "assistant", characterId, createdAt: bucket + CALENDAR_BUCKET_MS, variants: [{ content: "c" }] });
    expect(await readMomentumBuckets(db, ownerId)).toEqual([
      { characterId, name: "Aria", bucketStart: bucket, replies: 2 },
      { characterId, name: "Aria", bucketStart: bucket + CALENDAR_BUCKET_MS, replies: 1 },
    ]);
  });

  test("an empty library, another owner's replies and a husk room's greeting all stay out", async () => {
    expect(await readMomentumBuckets(db, ownerId)).toEqual([]);
    const husk = await seedChat(db, characterId, { id: "chat_husk", startedAt: null });
    await seedMessage(db, { chatId: husk, seq: 1, role: "assistant", characterId, createdAt: T0, variants: [{ content: "greeting" }] });
    const other = await seedUser(db, "user_other", "user");
    const theirs = await seedCharacter(db, other, { id: "character_theirs" });
    const theirChat = await seedChat(db, theirs, { id: "chat_theirs" });
    await seedMessage(db, { chatId: theirChat, seq: 1, role: "assistant", characterId: theirs, createdAt: T0, variants: [{ content: "x" }] });
    expect(await readMomentumBuckets(db, ownerId)).toEqual([]);
    expect((await readMomentumBuckets(db, other)).map((row) => row.replies)).toEqual([1]);
  });
});
