// entry/compose/session-entries — the D8 write path (issue #71) against a real libSQL :memory: db (FK
// enforcement ON, via freshDb): `createSessionEntryWriter`'s `insert` mints a real `SessionEntryId`
// (ID_PREFIX.sessionEntry) and picks the next per-chat `seq` off the current max (0 for the first entry,
// with `isPrimary` scoped to the chat + connection lineage); `update`
// rewrites an EXISTING row in place (the `reseeded` disposition — same `sdkSessionId`, no new row, no
// `seq` bump); the chatId FK rejects an unknown chat; the observability row count
// (`foundation/observability/debug`'s `tableCounts`) reflects the real writes; and the persisted row
// carries ONLY the schema's own columns — no credential/secret material can ride along (the writer's
// static input type already excludes it; this asserts the INSERTED row's own key set matches the schema
// exactly, so a future field addition can't smuggle something extra through unnoticed).

import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { chats, sessionEntries, userConnections } from "@orb/db";
import { agentSdkSessionIdSchema } from "@orb/inference";
import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { tableCounts } from "@orb/server/foundation/observability/debug";
import { eq } from "drizzle-orm";
import { createSessionEntryWriter } from "../../../../packages/server/src/entry/compose/session-entries.ts";
import { freshDb } from "../../../support/db.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

const SEEDED_THROUGH_SEQ = 2;
const CANON_HASH = "canon-hash-abc";

async function seedChat(db: Awaited<ReturnType<typeof freshDb>>, id: string): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId });
  return chatId;
}

async function seedConnection(db: Awaited<ReturnType<typeof freshDb>>, label: string): Promise<UserConnectionId> {
  const owner = await seedUser(db, { handle: castId(`session-writer-${label}`) });
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId: owner.id,
    label,
    providerId: providerIdSchema.parse("custom-openai"),
    model: modelIdSchema.parse("test-model"),
  });
  return connectionId;
}

test("insert mints a real SessionEntryId, seq=0, and isPrimary=true for a chat's FIRST entry", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_first");
  const connectionId = await seedConnection(db, "first");
  const writer = createSessionEntryWriter(db);

  await writer.insert({
    chatId,
    connectionId,
    sdkSessionId: agentSdkSessionIdSchema.parse("8f51fc80-b118-4c5f-a06a-37bcb7dd88e3"),
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id.startsWith("session_entry_")).toBe(true);
  expect(row?.chatId).toBe(chatId);
  expect(row?.connectionId).toBe(connectionId);
  expect(row?.seq).toBe(0);
  expect(row?.seededThroughSeq).toBe(SEEDED_THROUGH_SEQ);
  expect(row?.canonHash).toBe(CANON_HASH);
  expect(row?.isPrimary).toBe(true);
  expect(row?.createdAt).toBeTypeOf("number");
});

test("a SECOND insert for the same chat and connection gets the next seq and is NOT primary (awaits the reap)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_second");
  const connectionId = await seedConnection(db, "second");
  const writer = createSessionEntryWriter(db);

  await writer.insert({
    chatId,
    connectionId,
    sdkSessionId: agentSdkSessionIdSchema.parse("0fbad1c0-60fd-4b60-b347-02db454429dc"),
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });
  await writer.insert({
    chatId,
    connectionId,
    sdkSessionId: agentSdkSessionIdSchema.parse("bd75c2b7-8885-4296-9ea3-675804c5e790"),
    seededThroughSeq: SEEDED_THROUGH_SEQ + 1,
    canonHash: "canon-hash-def",
  });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId)).orderBy(sessionEntries.seq);
  expect(rows.map((r) => r.seq)).toEqual([0, 1]);
  expect(rows.map((r) => r.isPrimary)).toEqual([true, false]);
});

test("the same chat keeps an independent primary lineage for each connection", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_connection_primaries");
  const firstConnectionId = await seedConnection(db, "primary-first");
  const secondConnectionId = await seedConnection(db, "primary-second");
  const writer = createSessionEntryWriter(db);

  await writer.insert({
    chatId,
    connectionId: firstConnectionId,
    sdkSessionId: agentSdkSessionIdSchema.parse("e6db3570-2579-4d5c-bb97-89ea6c58fc99"),
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });
  await writer.insert({
    chatId,
    connectionId: secondConnectionId,
    sdkSessionId: agentSdkSessionIdSchema.parse("cfd967d6-a70a-4dc8-94ed-272e23f998cc"),
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId)).orderBy(sessionEntries.seq);
  expect(rows.map((row) => [row.connectionId, row.isPrimary])).toEqual([
    [firstConnectionId, true],
    [secondConnectionId, true],
  ]);
});

test("insert on a MISSING chat rejects via the chatId FK (a live throw, not a silent orphan write)", async () => {
  const db = await freshDb();
  const writer = createSessionEntryWriter(db);
  const connectionId = mintTypeId(ID_PREFIX.userConnection);

  await expect(
    writer.insert({
      chatId: castId<ChatId>("chat_does_not_exist"),
      connectionId,
      sdkSessionId: agentSdkSessionIdSchema.parse("88f0f864-77ae-4d63-b5da-210e8234dd1d"),
      seededThroughSeq: SEEDED_THROUGH_SEQ,
      canonHash: CANON_HASH,
    }),
  ).rejects.toThrow();
});

test("update rewrites the SAME row in place — no new row, seq unchanged, content updated (the `reseeded` disposition)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_update");
  const connectionId = await seedConnection(db, "update");
  const writer = createSessionEntryWriter(db);
  const sdkSessionId = agentSdkSessionIdSchema.parse("fe4c9e8c-8775-4c21-a207-0cc63da2c1e0");
  await writer.insert({ chatId, connectionId, sdkSessionId, seededThroughSeq: SEEDED_THROUGH_SEQ, canonHash: CANON_HASH });

  await writer.update({ connectionId, sdkSessionId, seededThroughSeq: SEEDED_THROUGH_SEQ + 5, canonHash: "canon-hash-rewritten" });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.seq).toBe(0);
  expect(row?.sdkSessionId).toBe(sdkSessionId);
  expect(row?.seededThroughSeq).toBe(SEEDED_THROUGH_SEQ + 5);
  expect(row?.canonHash).toBe("canon-hash-rewritten");
});

test("update refuses an SDK session owned by another connection and leaves its lineage unchanged", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_cross_connection");
  const owningConnectionId = await seedConnection(db, "owning");
  const foreignConnectionId = await seedConnection(db, "foreign");
  const sdkSessionId = agentSdkSessionIdSchema.parse("d9f7b024-2147-4468-a359-0bfd63d61b5c");
  const writer = createSessionEntryWriter(db);
  await writer.insert({ chatId, connectionId: owningConnectionId, sdkSessionId, seededThroughSeq: SEEDED_THROUGH_SEQ, canonHash: CANON_HASH });

  await expect(writer.update({ connectionId: foreignConnectionId, sdkSessionId, seededThroughSeq: 99, canonHash: "foreign-rewrite" })).rejects.toThrow(
    "does not belong to the resolved connection",
  );

  const [row] = await db.select().from(sessionEntries).where(eq(sessionEntries.sdkSessionId, sdkSessionId));
  expect(row?.connectionId).toBe(owningConnectionId);
  expect(row?.seededThroughSeq).toBe(SEEDED_THROUGH_SEQ);
  expect(row?.canonHash).toBe(CANON_HASH);
});

test("the observability row count (tableCounts) reflects live writer inserts", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_observability");
  const connectionId = await seedConnection(db, "observability");
  const writer = createSessionEntryWriter(db);

  expect((await tableCounts(db))["session_entries"]).toBe(0);
  await writer.insert({
    chatId,
    connectionId,
    sdkSessionId: agentSdkSessionIdSchema.parse("7cfcb040-710c-4751-a393-0bb6a58b7980"),
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });
  expect((await tableCounts(db))["session_entries"]).toBe(1);
  await writer.insert({
    chatId,
    connectionId,
    sdkSessionId: agentSdkSessionIdSchema.parse("9b315bd2-2731-4311-a791-327b984979cb"),
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });
  expect((await tableCounts(db))["session_entries"]).toBe(2);
});

test("the persisted row's own columns are EXACTLY the schema's — no extra/secret field rides along", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_writer_shape");
  const connectionId = await seedConnection(db, "shape");
  const writer = createSessionEntryWriter(db);

  await writer.insert({
    chatId,
    connectionId,
    sdkSessionId: agentSdkSessionIdSchema.parse("c3023771-23cf-4c5b-98bb-f7332996efdb"),
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  const row = rows[0];
  expect(row).toBeDefined();
  expect(Object.keys(row ?? {}).sort()).toEqual(
    ["canonHash", "chatId", "connectionId", "createdAt", "id", "isPrimary", "sdkSessionId", "seededThroughSeq", "seq"].sort(),
  );
});
