// `forkChat` (D27 — a fork is a DEEP COPY into a new membership-scoped chat; the only link is `parentChatId`;
// NO shared rows). Proves against a real libSQL db: the new chat has a fresh id + `parentChatId` lineage, the
// canon is copied with FRESH message/variant ids (mutating the fork leaves the source untouched), the FORKER
// becomes host while other humans are NOT auto-joined (D16 chokepoint — FLAG[fork-humans]), and `chatCreated`
// fires. Reached through the BUNDLE `createFork(ctx, { emit, loadParticipantViews })`.

import type { ChatBusEvent, ParticipantView } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chatInjections, chatParticipants, messages, messageVariants } from "@orb/db";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, asc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createFork } from "../../../../../packages/server/src/domain/chat/verbs/fork";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import {
  addVariant,
  makeChatContext,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedUser,
} from "../_support";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

/** A fake roster resolver (the root resolves `users` publics; here the name/handle derive from the id). */
async function loadParticipantViews(chatId: ChatId): Promise<readonly ParticipantView[]> {
  const rows = await db
    .select()
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), isNull(chatParticipants.leftSeq)));
  return rows.map((r) => ({
    id: r.id,
    chatId: r.chatId,
    kind: r.kind,
    userId: r.userId,
    characterId: r.characterId,
    role: r.role,
    activePersonaId: r.activePersonaId,
    talkativeness: r.talkativeness,
    disabled: r.disabled,
    joinedAt: r.joinedAt,
    joinSeq: r.joinSeq,
    leftSeq: r.leftSeq,
    joinHistoryVisibility: r.joinHistoryVisibility,
    displayName: r.userId ?? r.characterId ?? "",
    handle: r.userId === null ? null : castId<Handle>(r.userId),
    avatarAssetId: null,
  }));
}

describe("forkChat — canon-mutator stats push (stats.md)", () => {
  test("a fork pushes chat-created + every copied slot/swipe contribution into its creation batch", async () => {
    const host = await seedUser(db, "host");
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "one two" });
    const m2 = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: charA,
      content: "three",
    });
    await addVariant(db, m2.messageId, 1, "a swipe");
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });
    const fork = createFork(ctx, { emit, loadParticipantViews });

    await fork.forkChat({ principal: principal(host), chatId });

    // chat-created (+fork lineage) + 2 copied slots + 1 copied swipe = 4 deltas, all positive.
    expect(deltas).toHaveLength(4);
    const created = deltas.find((d) => d.chats === 1);
    expect(created?.forkedChats).toBe(1);
    expect(created?.chatsCreated).toBe(1);
    expect(deltas.filter((d) => d.userTurns === 1)).toHaveLength(1);
    expect(deltas.filter((d) => d.assistantTurns === 1)).toHaveLength(1);
    expect(deltas.filter((d) => d.swipes === 1)).toHaveLength(1);
    expect(new Set(deltas.map((d) => d.ownerId))).toEqual(new Set([host]));
  });
});

describe("forkChat — D27 deep copy", () => {
  test("a member forks: new chat is parented, canon is copied with fresh ids, the forker is host", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    const m1 = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: member,
      content: "one",
    });
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA, content: "two" });
    await db.insert(chatInjections).values({
      id: castId("chat_injection_src"),
      chatId,
      position: "in_prompt",
      depth: 0,
      role: "system",
      content: "note",
      createdAt: 1,
    });

    const fork = createFork(makeChatContext(db), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    expect(chat.parentChatId).toBe(chatId);
    expect(chat.id).not.toBe(chatId);
    expect(emitted).toEqual([{ type: "chatCreated", chatId: chat.id }]);

    // The forker is HOST of the fork; the cast copied as member; the OTHER human is NOT copied (FLAG[fork-humans]).
    const host2 = chat.participants.find((p) => p.role === "host");
    expect(host2?.userId).toBe(member);
    expect(chat.participants.some((p) => p.characterId === charA)).toBe(true);
    expect(chat.participants.some((p) => p.userId === host)).toBe(false);

    // The canon copied with FRESH ids (no shared rows), content preserved.
    const forkMsgs = await db
      .select({ id: messages.id, seq: messages.seq, content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chat.id))
      .orderBy(asc(messages.seq));
    expect(forkMsgs.map((r) => r.content)).toEqual(["one", "two"]);
    expect(forkMsgs.some((r) => r.id === m1.messageId)).toBe(false);

    const forkInjections = await db
      .select()
      .from(chatInjections)
      .where(eq(chatInjections.chatId, chat.id));
    expect(forkInjections).toHaveLength(1);
    expect(forkInjections[0]?.content).toBe("note");
    expect(forkInjections[0]?.id).not.toBe("chat_injection_src");
  });

  test("mutating the fork leaves the source canon untouched (no shared rows)", async () => {
    const host = await seedUser(db, "host");
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    const src = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: charA,
      content: "original",
    });

    const fork = createFork(makeChatContext(db), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId });

    // Edit the fork's copied variant directly; the source's variant must NOT change.
    const [forkMsg] = await db.select().from(messages).where(eq(messages.chatId, chat.id));
    await db
      .update(messageVariants)
      .set({ content: "mutated" })
      .where(eq(messageVariants.id, forkMsg?.selectedVariantId ?? castId("x")));

    const [srcVariant] = await db
      .select()
      .from(messageVariants)
      .where(eq(messageVariants.id, src.variantId));
    expect(srcVariant?.content).toBe("original");
  });

  test("throughSeq truncates the copy at the fork point", async () => {
    const host = await seedUser(db, "host");
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "kept" });
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA, content: "trimmed" });

    const fork = createFork(makeChatContext(db), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId, throughSeq: 1 });

    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chat.id));
    expect(forkMsgs.map((r) => r.content)).toEqual(["kept"]);
  });
});
