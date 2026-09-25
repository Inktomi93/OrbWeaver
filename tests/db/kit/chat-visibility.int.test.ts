// chat-visibility — the ONE member-visible chat scope and the ONE recency clock, pinned at the layer BOTH
// readers share (`domain/chat`'s library list and `domain/character`'s library row).
//
// `.int` because the subject IS sql: `memberVisibleChatScope` is a JOIN-ON clause and `chatRecencyExpr` a
// correlated sub-select, and neither has a meaning outside a real libSQL statement. A unit test over them
// could only assert the shape of a drizzle object, which proves nothing about what rows come back.
//
// WHAT THESE PIN (#1131). The character library used to derive "last chatted" and "how many chats" from the
// `character_stats` rollup — turn economics — and disagreed with the chat library, the editor header and the
// context pane. The two exports below are the agreement. The load-bearing rows:
//   · a HUSK and a TEMPORARY room are invisible, so a character seated only in one counts ZERO;
//   · a room the caller has LEFT is invisible, and another user's room was never hers;
//   · a character seated SECOND still counts — the exact 0-vs-1 shape the stats rollup got wrong, because
//     its chat counter is bumped only for a room's FIRST founding character (`chatCreatedDelta`);
//   · the recency clock is the newest MESSAGE, falling back to the row stamp, never `updated_at` alone.

import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, messages, messageVariants, users } from "@orb/db";
import { chatRecencyExpr, memberVisibleChatScope } from "@orb/db/kit";
import { handleKey } from "@orb/kit/handle-key";
import type { CharacterHandle, CharacterId, ChatId, ChatParticipantId, Handle, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, count, eq, exists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

const OWNER = castId<UserId>("user_owner");
const STRANGER = castId<UserId>("user_stranger");

const characterSeats = alias(chatParticipants, "character_seats");

interface RoomSpec {
  readonly id: string;
  readonly seat: CharacterId;
  readonly recencyAt: number;
  readonly member?: UserId;
  readonly archived?: boolean;
  readonly temporary?: boolean;
  readonly started?: boolean;
  readonly present?: boolean;
  /** A character seated BEFORE `seat`, so `seat` is the room's second founding character. */
  readonly coSeat?: CharacterId;
}

async function seedRoom(db: Db, spec: RoomSpec): Promise<void> {
  const chatId = castId<ChatId>(spec.id);
  await db.insert(chats).values({
    id: chatId,
    archived: spec.archived ?? false,
    temporary: spec.temporary ?? false,
    startedAt: (spec.started ?? true) ? spec.recencyAt : null,
    createdAt: spec.recencyAt,
    updatedAt: spec.recencyAt,
  });
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${spec.id}_human`),
    chatId,
    kind: "human",
    userId: spec.member ?? OWNER,
    role: "host",
    joinSeq: 0,
    ...((spec.present ?? true) ? {} : { leftSeq: 1 }),
  });
  if (spec.coSeat !== undefined) {
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>(`chat_participant_${spec.id}_co`),
      chatId,
      kind: "character",
      characterId: spec.coSeat,
      role: "member",
      joinSeq: 0,
    });
  }
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${spec.id}_seat`),
    chatId,
    kind: "character",
    characterId: spec.seat,
    role: "member",
    joinSeq: 1,
  });
}

async function seedCast(db: Db, ids: readonly CharacterId[]): Promise<void> {
  await db.insert(users).values({ id: OWNER, handle: castId<Handle>("owner"), role: "user", handleKey: handleKey(castId<Handle>("owner")) });
  await db.insert(users).values({ id: STRANGER, handle: castId<Handle>("stranger"), role: "user", handleKey: handleKey(castId<Handle>("stranger")) });
  for (const id of ids) {
    await db.insert(characters).values({
      id,
      ownerId: OWNER,
      handle: castId<CharacterHandle>(id),
      name: id,
      contentHash: `hash_${id}`,
    });
  }
}

/** The exact read the character library performs: how many member-visible rooms this character is seated in. */
async function roomsSeatedIn(db: Db, characterId: CharacterId, userId: UserId = OWNER): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(chats)
    .innerJoin(
      chatParticipants,
      and(
        memberVisibleChatScope(userId, {}),
        exists(
          db
            .select({ seated: sql`1` })
            .from(characterSeats)
            .where(and(eq(characterSeats.chatId, chats.id), eq(characterSeats.characterId, characterId))),
        ),
      ),
    );
  return rows.at(0)?.total ?? 0;
}

/** …and the stamp it prints beside that count.
 *
 *  `sql\`max(…)\``, NOT drizzle's `max()` helper: over a non-column expression the helper attaches a
 *  `.mapWith(String)` decoder and hands back `"9000"`. The production read wraps the whole sub-select in its
 *  own `sql<number | null>` template, which has no mapper and takes the driver's own integer — so spelling it
 *  the helper's way here would pin a decoding path no caller uses. */
async function lastChattedAt(db: Db, characterId: CharacterId): Promise<number | null> {
  const rows = await db
    .select({ at: sql<number | null>`max(${chatRecencyExpr(db)})` })
    .from(chats)
    .innerJoin(
      chatParticipants,
      and(
        memberVisibleChatScope(OWNER, {}),
        exists(
          db
            .select({ seated: sql`1` })
            .from(characterSeats)
            .where(and(eq(characterSeats.chatId, chats.id), eq(characterSeats.characterId, characterId))),
        ),
      ),
    );
  return rows.at(0)?.at ?? null;
}

const SOLO = castId<CharacterId>("character_solo");
const SECOND = castId<CharacterId>("character_second");
const FIRST = castId<CharacterId>("character_first");
const HIDDEN = castId<CharacterId>("character_hidden");

test("a room is visible only when the caller is a PRESENT member of a claimed, non-temporary, unarchived chat", async () => {
  const db = await freshDb();
  await seedCast(db, [SOLO, HIDDEN]);
  await seedRoom(db, { id: "chat_ok", seat: SOLO, recencyAt: 5000 });
  // Every excluded arm, one room each — all four seat the SAME character, so a leak shows up as a count.
  await seedRoom(db, { id: "chat_husk", seat: HIDDEN, recencyAt: 6000, started: false });
  await seedRoom(db, { id: "chat_temp", seat: HIDDEN, recencyAt: 6000, temporary: true });
  await seedRoom(db, { id: "chat_left", seat: HIDDEN, recencyAt: 6000, present: false });
  await seedRoom(db, { id: "chat_theirs", seat: HIDDEN, recencyAt: 6000, member: STRANGER });

  expect(await roomsSeatedIn(db, SOLO)).toBe(1);
  // THE CONTROL: the four excluded rooms exist and DO seat her — the zero is the lens, not an empty table.
  expect(await roomsSeatedIn(db, HIDDEN)).toBe(0);
  expect(await lastChattedAt(db, HIDDEN)).toBeNull();
  // …and the stranger's own membership sees the room that is hers.
  expect(await roomsSeatedIn(db, HIDDEN, STRANGER)).toBe(1);
});

test("ARCHIVED is a LENS, not a visibility arm — closed by default, opened by includeArchived", async () => {
  const db = await freshDb();
  await seedCast(db, [SOLO]);
  await seedRoom(db, { id: "chat_arch", seat: SOLO, recencyAt: 5000, archived: true });

  expect(await roomsSeatedIn(db, SOLO)).toBe(0);
  const opened = await db
    .select({ total: count() })
    .from(chats)
    .innerJoin(chatParticipants, memberVisibleChatScope(OWNER, { includeArchived: true }));
  expect(opened.at(0)?.total).toBe(1);
});

test("a character seated SECOND counts exactly as one seated first (#1131 — the 0-vs-1 the stats rollup got wrong)", async () => {
  const db = await freshDb();
  await seedCast(db, [FIRST, SECOND]);
  await seedRoom(db, { id: "chat_group", seat: SECOND, coSeat: FIRST, recencyAt: 5000 });

  expect(await roomsSeatedIn(db, FIRST)).toBe(1);
  expect(await roomsSeatedIn(db, SECOND)).toBe(1);
});

test("a room with two seats for ONE character counts once (the EXISTS, not a join)", async () => {
  const db = await freshDb();
  await seedCast(db, [SOLO]);
  // `coSeat` and `seat` are the same character — a re-seat, which a join would double.
  await seedRoom(db, { id: "chat_dup", seat: SOLO, coSeat: SOLO, recencyAt: 5000 });

  expect(await roomsSeatedIn(db, SOLO)).toBe(1);
});

test("the recency clock is the newest selected MESSAGE, falling back to the row stamp", async () => {
  const db = await freshDb();
  await seedCast(db, [SOLO]);
  // `updated_at` says 5000; the conversation's newest line says 9000. Every surface DISPLAYS the line's
  // time, so this is what the list must order and stamp by (#150).
  await seedRoom(db, { id: "chat_spoken", seat: SOLO, recencyAt: 5000 });
  const variantId = castId<MessageVariantId>("message_variant_1");
  const messageId = castId<MessageId>("message_1");
  await db.insert(messages).values({ id: messageId, chatId: castId<ChatId>("chat_spoken"), seq: 1, role: "user", createdAt: 9000 });
  await db.insert(messageVariants).values({ id: variantId, messageId, idx: 0, content: "hi", createdAt: 9000 });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));

  expect(await lastChattedAt(db, SOLO)).toBe(9000);
});

test("a message-less room falls back to its row stamp, and MAX picks the newest of several rooms", async () => {
  const db = await freshDb();
  await seedCast(db, [SOLO]);
  await seedRoom(db, { id: "chat_a", seat: SOLO, recencyAt: 3000 });
  await seedRoom(db, { id: "chat_b", seat: SOLO, recencyAt: 7000 });
  await seedRoom(db, { id: "chat_c", seat: SOLO, recencyAt: 5000 });

  expect(await lastChattedAt(db, SOLO)).toBe(7000);
  expect(await roomsSeatedIn(db, SOLO)).toBe(3);
});
