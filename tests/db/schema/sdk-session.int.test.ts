// sdk-session.int — the session_entries slice (the agent-sdk prompt-cache lineage, D8/D25) against a real
// libSQL :memory: db (FK enforcement ON). This is the SDK "chat session", NOT the BFF browser session
// (sessions.int covers that). Covers: the lineage round-trip (branded chatId; numeric born-at-insert
// timestamp; isPrimary default), mandatory connection identity, both chat and connection CASCADEs, the
// per-chat (chatId, seq) ordering/lineage UNIQUE (distinct ordinals coexist; a dup ordinal is rejected),
// the sdk_session_id resume-handle UNIQUE, and one primary per (chat, connection).

import type { Db } from "@orb/db";
import { chats, sessionEntries, userConnections } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { ChatId, SessionEntryId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedChat, seedUser } from "./_support.ts";

// Named consts — the canon-coverage horizon + the staleness-gate hash + the lineage ordinals (the head and
// the next reseed). Plain literals so the determinism gate stays green.
const SEEDED_THROUGH_SEQ = 12;
const CANON_HASH = "canon-hash-abc";
const LINEAGE_HEAD_SEQ = 0;
const LINEAGE_NEXT_SEQ = 1;

test("connection_id is required for every session_entry", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_connection_required" });

  let caught: unknown;
  try {
    await db.run(sql`INSERT INTO session_entries
      (id, chat_id, sdk_session_id, seq, seeded_through_seq, canon_hash)
      VALUES ('session_entry_connection_required', ${chatId}, 'sdk-connection-required', 0, ${SEEDED_THROUGH_SEQ}, ${CANON_HASH})`);
  } catch (err) {
    caught = err;
  }

  expect(isConstraintViolation(caught)?.kind).toBe("not-null");
});

// The fields that vary per test; the shared staleness columns are filled by insertEntry. An options object
// (not positional args) keeps insertEntry within the param budget and reads at the call site.
interface EntrySpec {
  id: SessionEntryId;
  chatId: ChatId;
  connectionId: UserConnectionId;
  sdkSessionId: string;
  seq: number;
  isPrimary?: boolean;
}

async function seedConnection(db: Db, suffix = "x"): Promise<UserConnectionId> {
  const ownerId = await seedUser(db, { id: `user_sdk_${suffix}` });
  const connectionId = castId<UserConnectionId>(`user_connection_sdk_${suffix}`);
  await db.run(sql`INSERT INTO user_connections (id, owner_id, label, provider_id, model)
    VALUES (${connectionId}, ${ownerId}, ${`SDK ${suffix}`}, 'custom-openai', 'test-model')`);
  return connectionId;
}

async function insertEntry(db: Db, entry: EntrySpec): Promise<void> {
  await db.insert(sessionEntries).values({
    ...entry,
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });
}

test("a session_entry round-trips (branded chatId; numeric timestamp; isPrimary defaults false)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_rt" });
  const connectionId = await seedConnection(db, "rt");
  const id = castId<SessionEntryId>("session_entry_rt");

  await db.insert(sessionEntries).values({
    id,
    chatId,
    connectionId,
    sdkSessionId: "sdk-sess-rt",
    seq: LINEAGE_HEAD_SEQ,
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.id, id));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.chatId).toBe(chatId);
  expect(row?.connectionId).toBe(connectionId);
  expect(row?.sdkSessionId).toBe("sdk-sess-rt");
  expect(row?.seq).toBe(LINEAGE_HEAD_SEQ);
  expect(row?.seededThroughSeq).toBe(SEEDED_THROUGH_SEQ);
  expect(row?.canonHash).toBe(CANON_HASH);
  // keepPrimary defaults false — a fresh entry is reaped-secondary until promoted.
  expect(row?.isPrimary).toBe(false);
  // Timestamps are plain epoch-ms numbers, born at insert via (unixepoch() * 1000).
  expect(row?.createdAt).toBeTypeOf("number");
});

test("the chatId FK rejects a session_entry for a missing chat", async () => {
  const db = await freshDb();
  const connectionId = await seedConnection(db, "orphan");

  let caught: unknown;
  try {
    await db.insert(sessionEntries).values({
      id: castId<SessionEntryId>("session_entry_orphan"),
      chatId: castId<ChatId>("chat_does_not_exist"),
      connectionId,
      sdkSessionId: "sdk-orphan",
      seq: LINEAGE_HEAD_SEQ,
      seededThroughSeq: SEEDED_THROUGH_SEQ,
      canonHash: CANON_HASH,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("deleting the chat cascades away its session_entries (keyed by chatId, D8/D25)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_cascade" });
  const connectionId = await seedConnection(db, "chat-cascade");
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_c1"),
    chatId,
    connectionId,
    sdkSessionId: "sdk-c1",
    seq: LINEAGE_HEAD_SEQ,
  });
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_c2"),
    chatId,
    connectionId,
    sdkSessionId: "sdk-c2",
    seq: LINEAGE_NEXT_SEQ,
  });

  await db.delete(chats).where(eq(chats.id, chatId));

  const remaining = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  expect(remaining).toHaveLength(0);
});

test("deleting the connection cascades away only its session lineage", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_connection_cascade" });
  const firstConnectionId = await seedConnection(db, "connection-cascade-first");
  const secondConnectionId = await seedConnection(db, "connection-cascade-second");
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_connection_cascade_first"),
    chatId,
    connectionId: firstConnectionId,
    sdkSessionId: "sdk-connection-cascade-first",
    seq: LINEAGE_HEAD_SEQ,
  });
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_connection_cascade_second"),
    chatId,
    connectionId: secondConnectionId,
    sdkSessionId: "sdk-connection-cascade-second",
    seq: LINEAGE_NEXT_SEQ,
  });

  await db.delete(userConnections).where(eq(userConnections.id, firstConnectionId));

  const remaining = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  expect(remaining.map((entry) => entry.connectionId)).toEqual([secondConnectionId]);
});

test("the lineage appends entries per chat — distinct seqs coexist, ordered by seq", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_lineage" });
  const connectionId = await seedConnection(db, "lineage");
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_head"),
    chatId,
    connectionId,
    sdkSessionId: "sdk-head",
    seq: LINEAGE_HEAD_SEQ,
  });
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_next"),
    chatId,
    connectionId,
    sdkSessionId: "sdk-next",
    seq: LINEAGE_NEXT_SEQ,
  });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId)).orderBy(sessionEntries.seq);
  expect(rows.map((entry) => entry.seq)).toEqual([LINEAGE_HEAD_SEQ, LINEAGE_NEXT_SEQ]);
});

test("the (chatId, seq) UNIQUE rejects a duplicate lineage ordinal", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_dupseq" });
  const connectionId = await seedConnection(db, "dupseq");
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_s1"),
    chatId,
    connectionId,
    sdkSessionId: "sdk-s1",
    seq: LINEAGE_HEAD_SEQ,
  });

  let caught: unknown;
  try {
    await insertEntry(db, {
      id: castId<SessionEntryId>("session_entry_s2"),
      chatId,
      connectionId,
      sdkSessionId: "sdk-s2",
      seq: LINEAGE_HEAD_SEQ,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("the sdk_session_id UNIQUE rejects a duplicate resume handle", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_dupsess" });
  const connectionId = await seedConnection(db, "dupsess");
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_u1"),
    chatId,
    connectionId,
    sdkSessionId: "sdk-shared",
    seq: LINEAGE_HEAD_SEQ,
  });

  let caught: unknown;
  try {
    await insertEntry(db, {
      id: castId<SessionEntryId>("session_entry_u2"),
      chatId,
      connectionId,
      sdkSessionId: "sdk-shared",
      seq: LINEAGE_NEXT_SEQ,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("the primary UNIQUE is scoped to (chat, connection)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_primary" });
  const firstConnectionId = await seedConnection(db, "primary-first");
  const secondConnectionId = await seedConnection(db, "primary-second");
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_primary_first"),
    chatId,
    connectionId: firstConnectionId,
    sdkSessionId: "sdk-primary-first",
    seq: LINEAGE_HEAD_SEQ,
    isPrimary: true,
  });
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_primary_second"),
    chatId,
    connectionId: secondConnectionId,
    sdkSessionId: "sdk-primary-second",
    seq: LINEAGE_NEXT_SEQ,
    isPrimary: true,
  });

  let caught: unknown;
  try {
    await insertEntry(db, {
      id: castId<SessionEntryId>("session_entry_primary_duplicate"),
      chatId,
      connectionId: firstConnectionId,
      sdkSessionId: "sdk-primary-duplicate",
      seq: 2,
      isPrimary: true,
    });
  } catch (err) {
    caught = err;
  }

  expect(isConstraintViolation(caught)?.kind).toBe("unique");
  const primaries = await db.select().from(sessionEntries).where(eq(sessionEntries.isPrimary, true));
  expect(primaries.map((entry) => entry.connectionId).sort()).toEqual([firstConnectionId, secondConnectionId].sort());
});
