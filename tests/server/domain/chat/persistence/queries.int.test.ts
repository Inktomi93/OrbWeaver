import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  listMemberChats,
  loadCanonHistory,
  loadChatEventBounds,
  loadChatEventReplay,
  loadChatMessageStats,
  loadChatRow,
  loadForkChildren,
  loadIsReplyToLatestUserMessage,
  loadMaxMessageSeq,
  loadMemberChat,
  loadMessagesPage,
  loadMessageVariantSummaries,
  loadStreamBounds,
  loadStreamReplay,
  loadSwipeStatRows,
  loadTurnOrigin,
} from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { addVariant, seedChat, seedChatEvent, seedMessage, seedParticipant, seedStreamEvent, seedUser } from "../_support.ts";

/** A page bound comfortably above every fixture here — these arms are about the FILTERS, not the keyset. */
const TEST_PAGE_LIMIT = 100;

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("loadIsReplyToLatestUserMessage — the rpg dice feed-forward slot-adjacency (05 §6)", () => {
  test("true when the target slot DIRECTLY follows the latest user message (the die-response); false for an older reply", async () => {
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1, { role: "user", content: "u1" });
    const reply1 = await seedMessage(db, chatId, 2, { role: "assistant", content: "a1" });
    await seedMessage(db, chatId, 3, { role: "user", content: "u2 [dice: d20 = 4 (4)]" });
    const reply2 = await seedMessage(db, chatId, 4, { role: "assistant", content: "a2" });

    // reply2 is the reply to the LATEST user message (u2) — swipe of it re-feeds; reply1 is an older reply.
    expect(await loadIsReplyToLatestUserMessage(db, chatId, reply2.messageId)).toBe(true);
    expect(await loadIsReplyToLatestUserMessage(db, chatId, reply1.messageId)).toBe(false);
  });

  test("false when a later assistant turn already sits after the die (an auto-continue slot is not the direct reply)", async () => {
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1, { role: "user", content: "u1 [dice: d20 = 4 (4)]" });
    const direct = await seedMessage(db, chatId, 2, { role: "assistant", content: "a1" });
    const continued = await seedMessage(db, chatId, 3, { role: "assistant", content: "a2 (auto-continue)" });

    expect(await loadIsReplyToLatestUserMessage(db, chatId, direct.messageId)).toBe(true);
    expect(await loadIsReplyToLatestUserMessage(db, chatId, continued.messageId)).toBe(false);
  });

  test("false when the chat has no user message", async () => {
    const chatId = await seedChat(db, "a");
    const only = await seedMessage(db, chatId, 1, { role: "assistant", content: "greeting" });
    expect(await loadIsReplyToLatestUserMessage(db, chatId, only.messageId)).toBe(false);
  });

  // A narrator/system row slipping between the die-bearing user message and the GM response (an automation
  // notice, an event-mirror line) steals "first slot after" — the response fails adjacency and a swipe of it
  // will NOT re-feed. Deliberately pinned: the fail direction is UNDER-feed (a normal roll), never a stale
  // re-feed, and the alternative (skipping non-assistant rows) would let a forged-adjacent slot over-feed.
  test("false for the die-response when a narrator row sits between it and the user message (under-feeds, fail-safe)", async () => {
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1, { role: "user", content: "u1 [dice: d20 = 20 (20)]" });
    const narrator = await seedMessage(db, chatId, 2, { role: "system", content: "[a quest clock advances]" });
    const response = await seedMessage(db, chatId, 3, { role: "assistant", content: "the GM response" });

    expect(await loadIsReplyToLatestUserMessage(db, chatId, response.messageId)).toBe(false);
    expect(await loadIsReplyToLatestUserMessage(db, chatId, narrator.messageId)).toBe(true);
  });
});

describe("persistence/queries — chat-row reads (D18 membership scope)", () => {
  test("loadMemberChat returns the host's row + role 'host'", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a", { title: "Room" });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    const result = await loadMemberChat(db, chatId, host);
    expect(result?.role).toBe("host");
    expect(result?.chat.id).toBe(chatId);
    expect(result?.chat.title).toBe("Room");
  });

  test("loadMemberChat returns role 'member' for a non-host present member", async () => {
    const member = await seedUser(db, castId<Handle>("m"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    expect((await loadMemberChat(db, chatId, member))?.role).toBe("member");
  });

  test("loadMemberChat is leak-free: undefined for a non-member AND for a left member", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const leaver = await seedUser(db, castId<Handle>("leaver"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "l", userId: leaver, role: "member", leftSeq: 3 });

    expect(await loadMemberChat(db, chatId, stranger)).toBeUndefined();
    expect(await loadMemberChat(db, chatId, leaver)).toBeUndefined();
  });

  test("loadMemberChat fault-isolates a malformed metadata sub-blob (never throws)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a", { metadata: { group: "not-an-object" } });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    const result = await loadMemberChat(db, chatId, host);
    expect(result?.chat.metadata.group).toBeUndefined();
  });

  test("loadChatRow is unscoped + parses metadata; undefined for a missing chat", async () => {
    const chatId = await seedChat(db, "a", { metadata: null });
    expect((await loadChatRow(db, chatId))?.metadata).toStrictEqual({});
    expect(await loadChatRow(db, castId<ChatId>("chat_nope"))).toBeUndefined();
  });

  // No messages anywhere in this fixture, so every room's recency clock IS its `updated_at` — this arm is
  // about the SCOPE (membership + archived), and it pins the fallback leg of the sort while it is at it.
  test("listMemberChats: present membership only, archived gated, newest first", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const other = await seedUser(db, castId<Handle>("other"));
    const a = await seedChat(db, "a", { updatedAt: 100 });
    const b = await seedChat(db, "b", { updatedAt: 200 });
    const archived = await seedChat(db, "arch", { archived: true, updatedAt: 300 });
    const notMine = await seedChat(db, "notmine", { updatedAt: 400 });
    await seedParticipant(db, { chatId: a, key: "a", userId: me, role: "host" });
    await seedParticipant(db, { chatId: b, key: "b", userId: me, role: "member" });
    await seedParticipant(db, { chatId: archived, key: "ar", userId: me, role: "host" });
    await seedParticipant(db, { chatId: notMine, key: "o", userId: other, role: "host" });

    const visible = await listMemberChats(db, me, { limit: TEST_PAGE_LIMIT });
    expect(visible.map((c) => c.id)).toStrictEqual([b, a]);

    const withArchived = await listMemberChats(db, me, { includeArchived: true, limit: TEST_PAGE_LIMIT });
    expect(withArchived.map((c) => c.id)).toStrictEqual([archived, b, a]);
  });

  // ONE RECENCY CLOCK (#150, owner-observed live 2026-08-17). The list sorted by `chats.updated_at` while
  // every row DISPLAYS `lastMessageAt ?? updatedAt`, and the two disagree in both directions: a turn does not
  // write the chat row (so the freshest conversation sank), and a metadata touch does (so a two-week-old room
  // led the home hero saying "you left off 2w ago"). The sort key IS the display key now — see
  // `chatRecencySql`.
  test("listMemberChats sorts by CONVERSATIONAL recency: a fresher message outranks a newer non-message touch", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    // `touched` carries the live shape exactly: a 2026-08 metadata write bumped its row stamp above every
    // other room while its last line was said two weeks earlier.
    const talked = await seedChat(db, "talked", { updatedAt: 1000 });
    const touched = await seedChat(db, "touched", { updatedAt: 5000 });
    await seedParticipant(db, { chatId: talked, key: "t", userId: me, role: "host" });
    await seedParticipant(db, { chatId: touched, key: "u", userId: me, role: "host" });
    await seedMessage(db, talked, 1, { role: "user", content: "tonight", createdAt: 9000 });
    await seedMessage(db, touched, 1, { role: "user", content: "a fortnight ago", createdAt: 2000 });

    expect((await listMemberChats(db, me, { limit: TEST_PAGE_LIMIT })).map((c) => c.id)).toStrictEqual([talked, touched]);
  });

  test("listMemberChats falls back to `updated_at` for a room with no messages — it never floats and never drops", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    const talked = await seedChat(db, "talked", { updatedAt: 1000 });
    // Started (not a husk) but never sent in: its only clock IS the row stamp.
    const silent = await seedChat(db, "silent", { updatedAt: 3000 });
    const stale = await seedChat(db, "stale", { updatedAt: 5000 });
    await seedParticipant(db, { chatId: talked, key: "t", userId: me, role: "host" });
    await seedParticipant(db, { chatId: silent, key: "s", userId: me, role: "host" });
    await seedParticipant(db, { chatId: stale, key: "x", userId: me, role: "host" });
    await seedMessage(db, talked, 1, { role: "user", content: "tonight", createdAt: 9000 });
    await seedMessage(db, stale, 1, { role: "user", content: "long ago", createdAt: 2000 });

    // 9000 (message) · 3000 (row stamp, no message) · 2000 (message, NOT its 5000 row stamp).
    expect((await listMemberChats(db, me, { limit: TEST_PAGE_LIMIT })).map((c) => c.id)).toStrictEqual([talked, silent, stale]);
  });

  test("listMemberChats: a slot whose SELECTED variant is gone does not set the sort clock (the display predicate, exactly)", async () => {
    const me = await seedUser(db, castId<Handle>("me"));
    // The row stamps are deliberately INVERTED against the conversational answer, so this arm fails both
    // ways: on the old `updated_at` sort AND on a recency expression that forgot the selected-variant join.
    const orphaned = await seedChat(db, "orphaned", { updatedAt: 6000 });
    const other = await seedChat(db, "other", { updatedAt: 1000 });
    await seedParticipant(db, { chatId: orphaned, key: "o", userId: me, role: "host" });
    await seedParticipant(db, { chatId: other, key: "p", userId: me, role: "host" });
    await seedMessage(db, orphaned, 1, { role: "user", content: "counted", createdAt: 2000 });
    const gone = await seedMessage(db, orphaned, 2, { role: "assistant", content: "not counted", createdAt: 8000 });
    await db.update(messages).set({ selectedVariantId: null }).where(eq(messages.id, gone.messageId));
    await seedMessage(db, other, 1, { role: "user", content: "newer", createdAt: 4000 });

    // `loadChatMessageStats` reports 2000 for `orphaned` (the selected-variant join), so the SORT must agree —
    // otherwise the row that leads the list shows an older stamp than the row under it.
    expect((await listMemberChats(db, me, { limit: TEST_PAGE_LIMIT })).map((c) => c.id)).toStrictEqual([other, orphaned]);
  });

  test("loadForkChildren returns the parent's fork children", async () => {
    const parent = await seedChat(db, "parent");
    const child = await seedChat(db, "child", { parentChatId: parent });
    await seedChat(db, "unrelated");
    expect((await loadForkChildren(db, parent)).map((c) => c.id)).toStrictEqual([child]);
  });
});

// The `ChatSummary` list chrome's aggregates. REGRESSION (owner dogfood 2026-07-31): the chat list read
// "7 messages" over a 3-message conversation because `resyncFromStory`/`editSnapshot` had appended four rpg
// state-anchor slots — empty-body assistant rows that existed only to KEY a snapshot. D124 made that row
// class unrepresentable (a hand-written snapshot is a message-less `rpg_snapshots` row and
// `postNarratorMessage` refuses a blank post), so the surviving predicate is the selected-variant join.
describe("persistence/queries — loadChatMessageStats (VISIBLE canon only)", () => {
  test("counts every canon row and takes the newest createdAt as lastMessageAt", async () => {
    const chatId = await seedChat(db, "a");
    const other = await seedChat(db, "b");
    const early = 1000;
    const late = 2000;
    await seedMessage(db, chatId, 1, { role: "user", content: "Ping?", createdAt: early });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "Pong.", createdAt: late });
    await seedMessage(db, other, 1, { role: "user", content: "elsewhere", createdAt: early });

    const stats = await loadChatMessageStats(db, [chatId, other]);
    expect(stats.get(chatId)).toStrictEqual({ messageCount: 2, lastMessageAt: late });
    // Batching is unaffected — the other chat still resolves independently.
    expect(stats.get(other)).toStrictEqual({ messageCount: 1, lastMessageAt: early });
  });

  test("a slot whose SELECTED variant is gone is not counted and never sets lastMessageAt", async () => {
    const chatId = await seedChat(db, "a");
    const early = 1000;
    const afterLate = 3000;
    await seedMessage(db, chatId, 1, { role: "user", content: "Ping?", createdAt: early });
    const orphan = await seedMessage(db, chatId, 2, { role: "assistant", content: "Pong.", createdAt: afterLate });
    await db.update(messages).set({ selectedVariantId: null }).where(eq(messages.id, orphan.messageId));
    expect(await loadChatMessageStats(db, [chatId])).toStrictEqual(new Map([[chatId, { messageCount: 1, lastMessageAt: early }]]));
  });

  test("an empty id list is a no-op (empty map, no query)", async () => {
    expect((await loadChatMessageStats(db, [])).size).toBe(0);
  });
});

describe("persistence/queries — canon reads (D26)", () => {
  test("loadMaxMessageSeq is 0 when empty, the max otherwise", async () => {
    const chatId = await seedChat(db, "a");
    expect(await loadMaxMessageSeq(db, chatId)).toBe(0);
    await seedMessage(db, chatId, 1);
    await seedMessage(db, chatId, 7);
    expect(await loadMaxMessageSeq(db, chatId)).toBe(7);
  });

  test("loadCanonHistory joins the selected variant, orders by seq, counts swipes, carries the excluded flag", async () => {
    const chatId = await seedChat(db, "a");
    const first = await seedMessage(db, chatId, 1, { content: "one", role: "user" });
    await addVariant(db, first.messageId, 1, "one-swipe");
    await seedMessage(db, chatId, 2, { content: "two", excludedFromPrompt: true });

    const history = await loadCanonHistory(db, chatId);
    expect(history.map((m) => m.seq)).toStrictEqual([1, 2]);
    expect(history[0]?.content).toBe("one");
    expect(history[0]?.variantCount).toBe(2);
    expect(history[0]?.selectedVariantIdx).toBe(0);
    expect(history[1]?.excludedFromPrompt).toBe(true);
    expect(history[1]?.variantCount).toBe(1);
  });

  test("loadMessagesPage windows backwards from beforeSeq, newest-first, capped at limit", async () => {
    const chatId = await seedChat(db, "a");
    await Promise.all([1, 2, 3, 4, 5].map((seq) => seedMessage(db, chatId, seq)));
    const page = await loadMessagesPage(db, chatId, { beforeSeq: 4, limit: 2, floorSeq: 0 });
    expect(page.map((m) => m.seq)).toStrictEqual([3, 2]);

    const tail = await loadMessagesPage(db, chatId, { beforeSeq: undefined, limit: 2, floorSeq: 0 });
    expect(tail.map((m) => m.seq)).toStrictEqual([5, 4]);
  });

  // The D16 `joinHistoryVisibility` floor at the QUERY level (the verb resolves it from the caller's own row;
  // this pins the SQL half): the floor is inclusive, it composes with the backward cursor, and a cursor that
  // has walked past the floor returns an EMPTY page — the honest terminal signal, never a fabricated one.
  test("loadMessagesPage floors at floorSeq (inclusive), composes with beforeSeq, and pages past the floor to empty", async () => {
    const chatId = await seedChat(db, "floor");
    await Promise.all([1, 2, 3, 4, 5].map((seq) => seedMessage(db, chatId, seq)));

    // floorSeq 3 hides seq 1-2 entirely, even on an unbounded tail read.
    expect((await loadMessagesPage(db, chatId, { beforeSeq: undefined, limit: 50, floorSeq: 3 })).map((m) => m.seq)).toStrictEqual([5, 4, 3]);
    // The floor is INCLUSIVE — the join row itself is readable.
    expect((await loadMessagesPage(db, chatId, { beforeSeq: 4, limit: 50, floorSeq: 3 })).map((m) => m.seq)).toStrictEqual([3]);
    // A cursor at the floor has nothing left below it: empty page, no fabricated rows.
    expect(await loadMessagesPage(db, chatId, { beforeSeq: 3, limit: 50, floorSeq: 3 })).toStrictEqual([]);
  });

  test("loadMessageVariantSummaries returns the full sibling set ordered by idx, no content", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = await seedMessage(db, chatId, 1);
    const v1 = await addVariant(db, messageId, 1, "second");
    const v2 = await addVariant(db, messageId, 2, "third");

    const rows = await loadMessageVariantSummaries(db, chatId, messageId, 0);
    expect(rows).toStrictEqual([
      { variantId, idx: 0 },
      { variantId: v1, idx: 1 },
      { variantId: v2, idx: 2 },
    ]);
  });

  test("loadMessageVariantSummaries is chat-scoped: a foreign chat's messageId matches nothing", async () => {
    const chatId = await seedChat(db, "a");
    const other = await seedChat(db, "b");
    const { messageId } = await seedMessage(db, chatId, 1);

    expect(await loadMessageVariantSummaries(db, other, messageId, 0)).toStrictEqual([]);
  });

  // #1399 — the floor is the query's OWN belt, so a below-floor slot and an absent one are one answer.
  test("loadMessageVariantSummaries is FLOORED: a slot below floorSeq matches nothing, the slot AT it resolves", async () => {
    const chatId = await seedChat(db, "a");
    const below = await seedMessage(db, chatId, 1);
    const atFloor = await seedMessage(db, chatId, 5);
    await addVariant(db, below.messageId, 1, "a pre-join swipe");

    expect(await loadMessageVariantSummaries(db, chatId, below.messageId, 5)).toStrictEqual([]);
    expect(await loadMessageVariantSummaries(db, chatId, atFloor.messageId, 5)).toStrictEqual([{ variantId: atFloor.variantId, idx: 0 }]);
    // The unclamped read (floor 0 — a host / a `full` member) still sees the same pre-join slot whole.
    expect(await loadMessageVariantSummaries(db, chatId, below.messageId, 0)).toHaveLength(2);
  });
});

describe("persistence/queries — stream-log / bus-log replay + cursors", () => {
  test("loadStreamReplay resumes after a cursor; loadStreamBounds reports min/max", async () => {
    const chatId = await seedChat(db, "a");
    await seedStreamEvent(db, chatId, 1, "a");
    await seedStreamEvent(db, chatId, 2, "b");
    await seedStreamEvent(db, chatId, 3, "c");

    expect((await loadStreamReplay(db, chatId, 1, 0)).map((e) => e.seq)).toStrictEqual([2, 3]);
    expect((await loadStreamReplay(db, chatId, undefined, 0)).map((e) => e.delta)).toStrictEqual(["a", "b", "c"]);
    expect(await loadStreamBounds(db, chatId)).toStrictEqual({ minSeq: 1, maxSeq: 3 });
  });

  // The D16 floor on the SSE token log: a stream row is raw transcript text, anchored to canon only through
  // its nullable `messageId`. A clamped caller gets rows whose slot is at/above the floor; a below-floor slot
  // AND a turn-level (`messageId IS NULL`, unclassifiable) row are both withheld.
  test("loadStreamReplay floors on the anchored slot's seq and withholds unanchored rows for a clamped caller", async () => {
    const chatId = await seedChat(db, "streamfloor");
    const pre = await seedMessage(db, chatId, 1, { content: "pre-join" });
    const post = await seedMessage(db, chatId, 5, { content: "post-join" });
    await seedStreamEvent(db, chatId, 1, { delta: "pre-tokens", messageId: pre.messageId });
    await seedStreamEvent(db, chatId, 2, { delta: "unanchored", messageId: null });
    await seedStreamEvent(db, chatId, 3, { delta: "post-tokens", messageId: post.messageId });

    // Unclamped (floor 0) sees the whole retained window, unanchored rows included.
    expect((await loadStreamReplay(db, chatId, undefined, 0)).map((e) => e.delta)).toStrictEqual(["pre-tokens", "unanchored", "post-tokens"]);
    // Clamped at seq 5: only the post-join slot's tokens survive.
    expect((await loadStreamReplay(db, chatId, undefined, 5)).map((e) => e.delta)).toStrictEqual(["post-tokens"]);
  });

  test("loadStreamBounds is null/null for an empty log", async () => {
    const chatId = await seedChat(db, "empty");
    expect(await loadStreamBounds(db, chatId)).toStrictEqual({ minSeq: null, maxSeq: null });
  });

  test("loadChatEventReplay resumes after a cursor; loadChatEventBounds reports the lastEventId head", async () => {
    const chatId = await seedChat(db, "a");
    await seedChatEvent(db, chatId, 1, "x");
    await seedChatEvent(db, chatId, 2, "y");

    const tail = await loadChatEventReplay(db, chatId, 1);
    expect(tail.map((e) => e.seq)).toStrictEqual([2]);
    expect(tail[0]?.payload.type).toBe("delta");
    expect((await loadChatEventBounds(db, chatId)).maxSeq).toBe(2);
  });
});

describe("loadTurnOrigin — the turn origin stamped on a reply slot (automation-design/03 §4)", () => {
  test("a default (human) slot reads back initiator 'human' / depth 0", async () => {
    const chatId = await seedChat(db, "origin-human");
    const { messageId } = await seedMessage(db, chatId, 1, { content: "hi" });
    expect(await loadTurnOrigin(db, chatId, messageId)).toEqual({ initiator: "human", automationDepth: 0 });
  });

  test("an automation-stamped slot round-trips its initiator + cascade depth", async () => {
    const chatId = await seedChat(db, "origin-auto");
    const { messageId } = await seedMessage(db, chatId, 1, { content: "auto" });
    await db.update(messages).set({ initiator: "automation", automationDepth: 3 }).where(eq(messages.id, messageId));
    expect(await loadTurnOrigin(db, chatId, messageId)).toEqual({ initiator: "automation", automationDepth: 3 });
  });

  test("a messageId from another chat resolves null (chat-scoped, leak-free)", async () => {
    const chatId = await seedChat(db, "origin-a");
    const other = await seedChat(db, "origin-b");
    const { messageId } = await seedMessage(db, other, 1, { content: "x" });
    expect(await loadTurnOrigin(db, chatId, messageId)).toBeNull();
  });
});

describe("loadSwipeStatRows — the delete-messages swipe delta", () => {
  test("returns every NON-selected variant of the slot", async () => {
    const chatId = await seedChat(db, "swipes");
    const { messageId } = await seedMessage(db, chatId, 1, { content: "selected" });
    await addVariant(db, messageId, 1, "swipe-a");
    await addVariant(db, messageId, 2, "swipe-b");

    const rows = await loadSwipeStatRows(db, chatId, [messageId]);
    expect(rows.map((r) => r.content).sort()).toStrictEqual(["swipe-a", "swipe-b"]);
  });

  test("a slot whose selectedVariantId is NULL yields ALL its variants, not none (the three-valued-logic drop)", async () => {
    // D26: the pointer is nullable — SET NULL fires when the pointed-at variant is deleted. A bare
    // `ne(variant.id, messages.selectedVariantId)` evaluates to NULL for such a slot, so SQL drops every one
    // of its variants and the delete-messages delta silently under-counts the whole slot.
    const chatId = await seedChat(db, "swipes-null");
    const { messageId } = await seedMessage(db, chatId, 1, { content: "orphaned" });
    await addVariant(db, messageId, 1, "swipe-a");
    await db.update(messages).set({ selectedVariantId: null }).where(eq(messages.id, messageId));

    const rows = await loadSwipeStatRows(db, chatId, [messageId]);
    expect(rows.map((r) => r.content).sort()).toStrictEqual(["orphaned", "swipe-a"]);
  });
});
