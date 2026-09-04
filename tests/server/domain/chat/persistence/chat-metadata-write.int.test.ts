// persistence/chat-metadata-write (.int — real libSQL: the whole point is what SQLite evaluates AT WRITE TIME).
// The ONE way `chats.metadata` is written. #1450: every knob used to read the row, merge its key in memory and
// write the WHOLE column back, so two writers on one live room silently discarded each other. These pins hold
// the shape that makes that impossible — a statement BUILT from a stale view of the room still lands on its own
// JSON path and nothing else.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { ChatId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { chatMetadataDropStatement, chatMetadataSetStatement } from "../../../../../packages/server/src/domain/chat/persistence/chat-metadata-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedChat } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

/** The guard the roster verbs pass when the room carries no asset background — the always-true predicate. */
const OPEN_GUARD = sql`1`;

async function metadataOf(chatId: ChatId): Promise<ChatMetadata> {
  const [row] = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId));
  return row?.metadata ?? {};
}

describe("chatMetadataSetStatement", () => {
  test("writes ONE key onto a NULL metadata column without erasing it", async () => {
    const chatId = await seedChat(db, "null-meta", { metadata: null });
    await db.batch(batchMany([chatMetadataSetStatement(db, { chatId, key: "offerChoices", value: true, guard: OPEN_GUARD, now: FROZEN_AT })]));
    expect(await metadataOf(chatId)).toEqual({ offerChoices: true });
  });

  test("a statement built from a STALE view still leaves the sibling key another writer landed", async () => {
    const chatId = await seedChat(db, "stale");
    // Built while the room held nothing — the writer's view of the room is now a beat old.
    const stale = chatMetadataSetStatement(db, { chatId, key: "reactionsEnabled", value: false, guard: OPEN_GUARD, now: FROZEN_AT });
    // Another writer lands in that window.
    await db.batch(batchMany([chatMetadataSetStatement(db, { chatId, key: "offerChoices", value: true, guard: OPEN_GUARD, now: FROZEN_AT })]));
    await db.batch(batchMany([stale]));

    const metadata = await metadataOf(chatId);
    expect(metadata.reactionsEnabled).toBe(false);
    expect(metadata.offerChoices).toBe(true);
  });

  test("an object value round-trips as JSON, not as a quoted string", async () => {
    const chatId = await seedChat(db, "object");
    await db.batch(
      batchMany([chatMetadataSetStatement(db, { chatId, key: "roomOverrides", value: { scenario: "a ford at dusk" }, guard: OPEN_GUARD, now: FROZEN_AT })]),
    );
    expect((await metadataOf(chatId)).roomOverrides).toEqual({ scenario: "a ford at dusk" });
  });

  test("the guard is the caller's: a failing predicate matches no row and RETURNS nothing", async () => {
    const chatId = await seedChat(db, "guarded");
    const [rows] = await db.batch(batchMany([chatMetadataSetStatement(db, { chatId, key: "offerChoices", value: true, guard: sql`0`, now: FROZEN_AT })]));
    expect(rows).toEqual([]);
    expect(await metadataOf(chatId)).toEqual({});
  });
});

describe("chatMetadataDropStatement", () => {
  test("removes its own key and leaves the siblings a stale reader would have re-asserted", async () => {
    const chatId = await seedChat(db, "drop");
    await db.batch(
      batchMany([
        chatMetadataSetStatement(db, { chatId, key: "offerChoices", value: true, guard: OPEN_GUARD, now: FROZEN_AT }),
        chatMetadataSetStatement(db, { chatId, key: "toolRecurseLimit", value: 6, guard: OPEN_GUARD, now: FROZEN_AT }),
      ]),
    );
    // Built BEFORE the sibling flip below — a detach must not carry the pre-flip value back.
    const detach = chatMetadataDropStatement(db, { chatId, key: "toolRecurseLimit", guard: OPEN_GUARD, now: FROZEN_AT });
    await db.batch(batchMany([chatMetadataSetStatement(db, { chatId, key: "offerChoices", value: false, guard: OPEN_GUARD, now: FROZEN_AT })]));
    await db.batch(batchMany([detach]));

    const metadata = await metadataOf(chatId);
    expect(metadata).not.toHaveProperty("toolRecurseLimit");
    expect(metadata.offerChoices).toBe(false);
  });

  test("dropping an ABSENT key is a no-op, never a column wipe", async () => {
    const chatId = await seedChat(db, "drop-absent");
    await db.batch(batchMany([chatMetadataSetStatement(db, { chatId, key: "offerChoices", value: true, guard: OPEN_GUARD, now: FROZEN_AT })]));
    await db.batch(batchMany([chatMetadataDropStatement(db, { chatId, key: "rpg", guard: OPEN_GUARD, now: FROZEN_AT })]));
    expect(await metadataOf(chatId)).toEqual({ offerChoices: true });
  });
});
