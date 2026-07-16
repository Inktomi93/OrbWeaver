// sdk-session.int — the session_entries slice (the agent-sdk prompt-cache lineage, D8/D25) against a real
// libSQL :memory: db (FK enforcement ON). This is the SDK "chat session", NOT the BFF browser session
// (sessions.int covers that). Covers: the lineage round-trip (branded chatId; numeric born-at-insert
// timestamp; isPrimary default), the chatId FK enforcement, the chats CASCADE (delete chat → its
// session_entries gone — keyed by chatId, no chats.sessionId back-pointer), the per-chat (chatId, seq)
// ordering/lineage UNIQUE (distinct ordinals coexist; a dup ordinal is rejected), and the sdk_session_id
// resume-handle UNIQUE.

import type { Db } from "@orb/db";
import { chats, isConstraintViolation, sessionEntries } from "@orb/db";
import type { ChatId, SessionEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedChat } from "./_support.ts";

// Named consts — the canon-coverage horizon + the staleness-gate hash + the lineage ordinals (the head and
// the next reseed). Plain literals so the determinism gate stays green.
const SEEDED_THROUGH_SEQ = 12;
const CANON_HASH = "canon-hash-abc";
const LINEAGE_HEAD_SEQ = 0;
const LINEAGE_NEXT_SEQ = 1;

// The fields that vary per test; the shared staleness columns are filled by insertEntry. An options object
// (not positional args) keeps insertEntry within the param budget and reads at the call site.
interface EntrySpec {
  id: SessionEntryId;
  chatId: ChatId;
  sdkSessionId: string;
  seq: number;
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
  const id = castId<SessionEntryId>("session_entry_rt");

  await db.insert(sessionEntries).values({
    id,
    chatId,
    sdkSessionId: "sdk-sess-rt",
    seq: LINEAGE_HEAD_SEQ,
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.id, id));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.chatId).toBe(chatId);
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

  let caught: unknown;
  try {
    await db.insert(sessionEntries).values({
      id: castId<SessionEntryId>("session_entry_orphan"),
      chatId: castId<ChatId>("chat_does_not_exist"),
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
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_c1"),
    chatId,
    sdkSessionId: "sdk-c1",
    seq: LINEAGE_HEAD_SEQ,
  });
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_c2"),
    chatId,
    sdkSessionId: "sdk-c2",
    seq: LINEAGE_NEXT_SEQ,
  });

  await db.delete(chats).where(eq(chats.id, chatId));

  const remaining = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId));
  expect(remaining).toHaveLength(0);
});

test("the lineage appends entries per chat — distinct seqs coexist, ordered by seq", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_lineage" });
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_head"),
    chatId,
    sdkSessionId: "sdk-head",
    seq: LINEAGE_HEAD_SEQ,
  });
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_next"),
    chatId,
    sdkSessionId: "sdk-next",
    seq: LINEAGE_NEXT_SEQ,
  });

  const rows = await db.select().from(sessionEntries).where(eq(sessionEntries.chatId, chatId)).orderBy(sessionEntries.seq);
  expect(rows.map((entry) => entry.seq)).toEqual([LINEAGE_HEAD_SEQ, LINEAGE_NEXT_SEQ]);
});

test("the (chatId, seq) UNIQUE rejects a duplicate lineage ordinal", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_sdk_dupseq" });
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_s1"),
    chatId,
    sdkSessionId: "sdk-s1",
    seq: LINEAGE_HEAD_SEQ,
  });

  let caught: unknown;
  try {
    await insertEntry(db, {
      id: castId<SessionEntryId>("session_entry_s2"),
      chatId,
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
  await insertEntry(db, {
    id: castId<SessionEntryId>("session_entry_u1"),
    chatId,
    sdkSessionId: "sdk-shared",
    seq: LINEAGE_HEAD_SEQ,
  });

  let caught: unknown;
  try {
    await insertEntry(db, {
      id: castId<SessionEntryId>("session_entry_u2"),
      chatId,
      sdkSessionId: "sdk-shared",
      seq: LINEAGE_NEXT_SEQ,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});
