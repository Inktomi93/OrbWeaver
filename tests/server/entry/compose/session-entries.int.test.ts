// entry/compose/session-entries — the D8 write path (issue #71) against a real libSQL :memory: db (FK
// enforcement ON, via freshDb): `createSessionEntryWriter`'s `insert` mints a real `SessionEntryId`
// (ID_PREFIX.sessionEntry) and picks the next per-chat `seq` off the current max (0 for the first entry,
// which also becomes the live `isPrimary`; every later entry for the SAME chat is a secondary); `update`
// rewrites an EXISTING row in place (the `reseeded` disposition — same `sdkSessionId`, no new row, no
// `seq` bump); the chatId FK rejects an unknown chat; the observability row count
// (`foundation/observability/debug`'s `tableCounts`) reflects the real writes; and the persisted row
// carries ONLY the schema's own columns — no credential/secret material can ride along (the writer's
// static input type already excludes it; this asserts the INSERTED row's own key set matches the schema
// exactly, so a future field addition can't smuggle something extra through unnoticed).

import { chats, sessionEntries } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { tableCounts } from "@orb/server/foundation/observability/debug";
import { eq } from "drizzle-orm";
import { createSessionEntryWriter } from "../../../../packages/server/src/entry/compose/session-entries.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const SEEDED_THROUGH_SEQ = 2;
const CANON_HASH = "canon-hash-abc";

async function seedChat(db: Awaited<ReturnType<typeof freshDb>>, id: string): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId });
  return chatId;
}

test("insert mints a real SessionEntryId, seq=0, and isPrimary=true for a chat's FIRST entry", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_first");
  const writer = createSessionEntryWriter(db);

  await writer.insert({ chatId, sdkSessionId: "sdk-1", seededThroughSeq: SEEDED_THROUGH_SEQ, canonHash: CANON_HASH });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id.startsWith("session_entry_")).toBe(true);
  expect(row?.chatId).toBe(chatId);
  expect(row?.sdkSessionId).toBe("sdk-1");
  expect(row?.seq).toBe(0);
  expect(row?.seededThroughSeq).toBe(SEEDED_THROUGH_SEQ);
  expect(row?.canonHash).toBe(CANON_HASH);
  expect(row?.isPrimary).toBe(true);
  expect(row?.createdAt).toBeTypeOf("number");
});

test("a SECOND insert for the same chat gets the next seq and is NOT primary (awaits the reap)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_second");
  const writer = createSessionEntryWriter(db);

  await writer.insert({ chatId, sdkSessionId: "sdk-a", seededThroughSeq: SEEDED_THROUGH_SEQ, canonHash: CANON_HASH });
  await writer.insert({ chatId, sdkSessionId: "sdk-b", seededThroughSeq: SEEDED_THROUGH_SEQ + 1, canonHash: "canon-hash-def" });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId)).orderBy(sessionEntries.seq);
  expect(rows.map((r) => r.seq)).toEqual([0, 1]);
  expect(rows.map((r) => r.isPrimary)).toEqual([true, false]);
  expect(rows.map((r) => r.sdkSessionId)).toEqual(["sdk-a", "sdk-b"]);
});

test("insert on a MISSING chat rejects via the chatId FK (a live throw, not a silent orphan write)", async () => {
  const db = await freshDb();
  const writer = createSessionEntryWriter(db);

  await expect(
    writer.insert({
      chatId: castId<ChatId>("chat_does_not_exist"),
      sdkSessionId: "sdk-orphan",
      seededThroughSeq: SEEDED_THROUGH_SEQ,
      canonHash: CANON_HASH,
    }),
  ).rejects.toThrow();
});

test("update rewrites the SAME row in place — no new row, seq unchanged, content updated (the `reseeded` disposition)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_update");
  const writer = createSessionEntryWriter(db);
  await writer.insert({ chatId, sdkSessionId: "sdk-reseed", seededThroughSeq: SEEDED_THROUGH_SEQ, canonHash: CANON_HASH });

  await writer.update({ sdkSessionId: "sdk-reseed", seededThroughSeq: SEEDED_THROUGH_SEQ + 5, canonHash: "canon-hash-rewritten" });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.seq).toBe(0);
  expect(row?.sdkSessionId).toBe("sdk-reseed");
  expect(row?.seededThroughSeq).toBe(SEEDED_THROUGH_SEQ + 5);
  expect(row?.canonHash).toBe("canon-hash-rewritten");
});

test("the observability row count (tableCounts) reflects live writer inserts", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_observability");
  const writer = createSessionEntryWriter(db);

  expect((await tableCounts(db))["session_entries"]).toBe(0);
  await writer.insert({ chatId, sdkSessionId: "sdk-obs-1", seededThroughSeq: SEEDED_THROUGH_SEQ, canonHash: CANON_HASH });
  expect((await tableCounts(db))["session_entries"]).toBe(1);
  await writer.insert({ chatId, sdkSessionId: "sdk-obs-2", seededThroughSeq: SEEDED_THROUGH_SEQ, canonHash: CANON_HASH });
  expect((await tableCounts(db))["session_entries"]).toBe(2);
});

test("the persisted row's own columns are EXACTLY the schema's — no extra/secret field rides along", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_shape");
  const writer = createSessionEntryWriter(db);

  await writer.insert({ chatId, sdkSessionId: "sdk-shape", seededThroughSeq: SEEDED_THROUGH_SEQ, canonHash: CANON_HASH });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  const row = rows[0];
  expect(row).toBeDefined();
  // `connectionId` is the §5.3b per-user-runtime-dir column: NULL from this pre-cutover writer, present on the row.
  expect(Object.keys(row ?? {}).sort()).toEqual(
    ["canonHash", "chatId", "connectionId", "createdAt", "id", "isPrimary", "sdkSessionId", "seededThroughSeq", "seq"].sort(),
  );
});
