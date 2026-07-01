import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  chatEventBounds,
  listMemberChats,
  loadCanonHistory,
  loadChatRow,
  loadForkChildren,
  loadMaxMessageSeq,
  loadMemberChat,
  loadMessagesPage,
  replayChatEvents,
  replayStreamEvents,
  streamEventBounds,
} from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import {
  addVariant,
  seedChat,
  seedChatEvent,
  seedMessage,
  seedParticipant,
  seedStreamEvent,
  seedUser,
} from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
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
    const page = await loadMessagesPage(db, chatId, 4, 2);
    expect(page.map((m) => m.seq)).toStrictEqual([3, 2]);

    const tail = await loadMessagesPage(db, chatId, undefined, 2);
    expect(tail.map((m) => m.seq)).toStrictEqual([5, 4]);
  });
});

describe("persistence/queries — stream-log / bus-log replay + cursors", () => {
  test("replayStreamEvents resumes after a cursor; streamEventBounds reports min/max", async () => {
    const chatId = await seedChat(db, "a");
    await seedStreamEvent(db, chatId, 1, "a");
    await seedStreamEvent(db, chatId, 2, "b");
    await seedStreamEvent(db, chatId, 3, "c");

    expect((await replayStreamEvents(db, chatId, 1)).map((e) => e.seq)).toStrictEqual([2, 3]);
    expect((await replayStreamEvents(db, chatId)).map((e) => e.delta)).toStrictEqual([
      "a",
      "b",
      "c",
    ]);
    expect(await streamEventBounds(db, chatId)).toStrictEqual({ minSeq: 1, maxSeq: 3 });
  });

  test("streamEventBounds is null/null for an empty log", async () => {
    const chatId = await seedChat(db, "empty");
    expect(await streamEventBounds(db, chatId)).toStrictEqual({ minSeq: null, maxSeq: null });
  });

  test("replayChatEvents resumes after a cursor; chatEventBounds reports the lastEventId head", async () => {
    const chatId = await seedChat(db, "a");
    await seedChatEvent(db, chatId, 1, "x");
    await seedChatEvent(db, chatId, 2, "y");

    const tail = await replayChatEvents(db, chatId, 1);
    expect(tail.map((e) => e.seq)).toStrictEqual([2]);
    expect(tail[0]?.payload.type).toBe("delta");
    expect((await chatEventBounds(db, chatId)).maxSeq).toBe(2);
  });
});
