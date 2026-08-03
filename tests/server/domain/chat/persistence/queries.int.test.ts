import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  listMemberChats,
  loadCanonHistory,
  loadChatEventBounds,
  loadChatEventReplay,
  loadChatMessageStats,
  loadChatParticipantCharacterIds,
  loadChatRow,
  loadForkChildren,
  loadIsReplyToLatestUserMessage,
  loadMaxMessageSeq,
  loadMemberChat,
  loadMessagesPage,
  loadMessageVariantSummaries,
  loadStreamBounds,
  loadStreamReplay,
  loadTurnForClassify,
  loadTurnOrigin,
} from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { addVariant, seedCharacter, seedChat, seedChatEvent, seedMessage, seedParticipant, seedStreamEvent, seedUser } from "../_support";

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
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a", { title: "Room" });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    const result = await loadMemberChat(db, chatId, host);
    expect(result?.role).toBe("host");
    expect(result?.chat.id).toBe(chatId);
    expect(result?.chat.title).toBe("Room");
  });

  test("loadMemberChat returns role 'member' for a non-host present member", async () => {
    const member = await seedUser(db, "m");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    expect((await loadMemberChat(db, chatId, member))?.role).toBe("member");
  });

  test("loadMemberChat is leak-free: undefined for a non-member AND for a left member", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    const leaver = await seedUser(db, "leaver");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "l", userId: leaver, role: "member", leftSeq: 3 });

    expect(await loadMemberChat(db, chatId, stranger)).toBeUndefined();
    expect(await loadMemberChat(db, chatId, leaver)).toBeUndefined();
  });

  test("loadMemberChat fault-isolates a malformed metadata sub-blob (never throws)", async () => {
    const host = await seedUser(db, "host");
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

  test("listMemberChats: present membership only, archived gated, newest-updated first", async () => {
    const me = await seedUser(db, "me");
    const other = await seedUser(db, "other");
    const a = await seedChat(db, "a", { updatedAt: 100 });
    const b = await seedChat(db, "b", { updatedAt: 200 });
    const archived = await seedChat(db, "arch", { archived: true, updatedAt: 300 });
    const notMine = await seedChat(db, "notmine", { updatedAt: 400 });
    await seedParticipant(db, { chatId: a, key: "a", userId: me, role: "host" });
    await seedParticipant(db, { chatId: b, key: "b", userId: me, role: "member" });
    await seedParticipant(db, { chatId: archived, key: "ar", userId: me, role: "host" });
    await seedParticipant(db, { chatId: notMine, key: "o", userId: other, role: "host" });

    const visible = await listMemberChats(db, me);
    expect(visible.map((c) => c.id)).toStrictEqual([b, a]);

    const withArchived = await listMemberChats(db, me, true);
    expect(withArchived.map((c) => c.id)).toStrictEqual([archived, b, a]);
  });

  test("loadForkChildren returns the parent's fork children", async () => {
    const parent = await seedChat(db, "parent");
    const child = await seedChat(db, "child", { parentChatId: parent });
    await seedChat(db, "unrelated");
    expect((await loadForkChildren(db, parent)).map((c) => c.id)).toStrictEqual([child]);
  });
});

describe("persistence/queries — loadChatParticipantCharacterIds (the FIX-#1 reverse read)", () => {
  test("returns character-seat ids per chat, batched; human seats excluded; a no-character chat is absent", async () => {
    const owner = await seedUser(db, "owner");
    const human = await seedUser(db, "human");
    const charA = await seedCharacter(db, owner, "a");
    const charB = await seedCharacter(db, owner, "b");
    const chat1 = await seedChat(db, "c1");
    const chat2 = await seedChat(db, "c2");
    const soloHuman = await seedChat(db, "solo");
    await seedParticipant(db, { chatId: chat1, key: "1h", userId: human, role: "host" });
    await seedParticipant(db, { chatId: chat1, key: "1a", characterId: charA });
    await seedParticipant(db, { chatId: chat1, key: "1b", characterId: charB });
    await seedParticipant(db, { chatId: chat2, key: "2a", characterId: charA });
    // A chat with only a human seat — must be ABSENT from the map (the verb defaults it to []).
    await seedParticipant(db, { chatId: soloHuman, key: "sh", userId: human, role: "host" });

    const map = await loadChatParticipantCharacterIds(db, [chat1, chat2, soloHuman]);
    expect(new Set(map.get(chat1))).toStrictEqual(new Set([charA, charB]));
    expect(map.get(chat2)).toStrictEqual([charA]);
    expect(map.has(soloHuman)).toBe(false);
  });

  test("INCLUDES departed (leftSeq) character seats — §7 wants every chat you've had with them", async () => {
    const owner = await seedUser(db, "owner");
    const present = await seedCharacter(db, owner, "present");
    const departed = await seedCharacter(db, owner, "departed");
    const chatId = await seedChat(db, "c");
    await seedParticipant(db, { chatId, key: "p", characterId: present });
    // A character that has since LEFT the chat (leftSeq set) still counts for the reverse read.
    await seedParticipant(db, { chatId, key: "d", characterId: departed, leftSeq: 5 });

    const map = await loadChatParticipantCharacterIds(db, [chatId]);
    expect(new Set(map.get(chatId))).toStrictEqual(new Set([present, departed]));
  });

  test("dedupes a character that left and rejoined (two seat rows → one id)", async () => {
    const owner = await seedUser(db, "owner");
    const rejoiner = await seedCharacter(db, owner, "rejoiner");
    const chatId = await seedChat(db, "c");
    // Left once (leftSeq set) then rejoined (present) — two rows, one character.
    await seedParticipant(db, { chatId, key: "left", characterId: rejoiner, leftSeq: 3 });
    await seedParticipant(db, { chatId, key: "back", characterId: rejoiner, joinSeq: 4 });

    expect(await loadChatParticipantCharacterIds(db, [chatId])).toStrictEqual(new Map([[chatId, [rejoiner]]]));
  });

  test("an empty id list is a no-op (empty map, no query)", async () => {
    expect((await loadChatParticipantCharacterIds(db, [])).size).toBe(0);
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

    const rows = await loadMessageVariantSummaries(db, chatId, messageId);
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

    expect(await loadMessageVariantSummaries(db, other, messageId)).toStrictEqual([]);
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

// The expressions post-turn read (expressions-design/02 §3.1): the injected `readTurn` op surfaces the
// variant's STORED content — which the pipeline already receive-tier-regex'd before persisting — never the raw
// model text, and never a re-applied regex. These pin that projection + the id-scoping (swipe-safe, leak-free).
describe("persistence/queries — loadTurnForClassify (the classify prose read)", () => {
  test("returns the speaker + the POST-regex prose the classifier sees (the stored, rewritten content)", async () => {
    // A host regex script that strips a *…* action stage-direction from the AI output (the pipeline runs this
    // AI_OUTPUT-placement transform BEFORE persisting — `applyRegexReplace` is `text.replace`). The classifier
    // must see the REWRITTEN prose, not the raw model reply.
    const raw = "*She grins wide.* I'm absolutely thrilled!";
    const rewritten = raw.replace(/\*[^*]*\*\s*/gu, ""); // → "I'm absolutely thrilled!"
    expect(rewritten).not.toBe(raw); // the script actually rewrote something

    const owner = await seedUser(db, "host");
    const character = await seedCharacter(db, owner, "aria");
    const chatId = await seedChat(db, "c");
    // The committed assistant slot stores the POST-regex canon (what the pipeline persisted).
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { characterId: character, content: rewritten });

    const result = await loadTurnForClassify(db, chatId, messageId, variantId);
    expect(result).toEqual({ speakerCharacterId: character, text: rewritten });
    expect(result?.text).not.toContain("She grins"); // the raw action never reaches the classifier
  });

  test("speakerCharacterId is null for a user turn (no sprite target)", async () => {
    const owner = await seedUser(db, "host");
    const chatId = await seedChat(db, "c");
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "user", authorUserId: owner, content: "hello" });

    expect(await loadTurnForClassify(db, chatId, messageId, variantId)).toEqual({ speakerCharacterId: null, text: "hello" });
  });

  test("null when the variant vanished / the ids don't belong together (leak-free, swipe-safe)", async () => {
    const owner = await seedUser(db, "host");
    const character = await seedCharacter(db, owner, "aria");
    const chatId = await seedChat(db, "c");
    const otherChat = await seedChat(db, "other");
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { characterId: character, content: "hi" });
    const wrongVariant = await addVariant(db, messageId, 1, "swipe");

    // wrong chat scoping → null (a foreign chatId can't read the variant).
    expect(await loadTurnForClassify(db, otherChat, messageId, variantId)).toBeNull();
    // gone variant id → null.
    expect(await loadTurnForClassify(db, chatId, messageId, castId("variant_gone"))).toBeNull();
    // a variant that belongs to a DIFFERENT slot than the messageId passed → null (the pair must agree).
    expect(await loadTurnForClassify(db, chatId, castId("message_other"), wrongVariant)).toBeNull();
  });

  test("reads the EXACT variant requested, not the slot's selected pointer (swipe correctness)", async () => {
    const owner = await seedUser(db, "host");
    const character = await seedCharacter(db, owner, "aria");
    const chatId = await seedChat(db, "c");
    // seq-1 slot's first variant is the SELECTED one ("first"); append a second, non-selected variant.
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { characterId: character, content: "first" });
    const secondVariant = await addVariant(db, messageId, 1, "second");

    // The classify hook passes the committed variant id — the read honors it, not the selected pointer.
    expect((await loadTurnForClassify(db, chatId, messageId, variantId))?.text).toBe("first");
    expect((await loadTurnForClassify(db, chatId, messageId, secondVariant))?.text).toBe("second");
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
