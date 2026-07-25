// `forkChat` (D27 — a fork is a DEEP COPY into a new membership-scoped chat; the only link is `parentChatId`;
// NO shared rows). Proves against a real libSQL db: the new chat has a fresh id + `parentChatId` lineage, the
// canon is copied with FRESH message/variant ids (mutating the fork leaves the source untouched), the FORKER
// becomes host while other humans are NOT auto-joined (D16 chokepoint — FLAG[fork-humans]), and `chatCreated`
// fires. Reached through the BUNDLE `createFork(ctx, { emit, loadParticipantViews })`.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { characters, chatInjections, chats, messages, messageVariants } from "@orb/db";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createFork } from "../../../../../packages/server/src/domain/chat/verbs/fork";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import { addVariant, makeChatContext, makeLoadParticipantViews, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support";

let db: Db;
let emitted: ChatBusEvent[];
let loadParticipantViews: ReturnType<typeof makeLoadParticipantViews>;

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
  loadParticipantViews = makeLoadParticipantViews(db);
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** An owner-scoped `getCard` fake mirroring the REAL one (D28 — `loadOwnedCharacterRow`): the card resolves
 *  only for its OWNER, `null` for a non-owner. The fork cast-drop resolver (D64 / F4) calls this per seated
 *  character to decide which seats the forker doesn't own (→ dropped); the harness default is a bare `null`. */
function ownedCard(): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId));
    if (row === undefined || row.ownerId !== ownerId) {
      return null;
    }
    // The D64 resolver reads only null-vs-resolved; `characterParticipantView` reads only name/avatarAssetId.
    // FABRICATION-OK: minimal `CharacterCard` double (scenario.ts precedent).
    return { name: row.name, avatarAssetId: null } as unknown as CharacterCard;
  };
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
      getCard: ownedCard(),
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
    // The forker (member) OWNS the cast — the F4 cast-ownership guard requires the new host to own every
    // seated card; a member forking a cast they DON'T own is refused (proven in the guard test below).
    const charA = await seedCharacter(db, member, "aria");
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

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
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

    const forkInjections = await db.select().from(chatInjections).where(eq(chatInjections.chatId, chat.id));
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

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId });

    // Edit the fork's copied variant directly; the source's variant must NOT change.
    const [forkMsg] = await db.select().from(messages).where(eq(messages.chatId, chat.id));
    await db
      .update(messageVariants)
      .set({ content: "mutated" })
      .where(eq(messageVariants.id, forkMsg?.selectedVariantId ?? castId("x")));

    const [srcVariant] = await db.select().from(messageVariants).where(eq(messageVariants.id, src.variantId));
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

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId, throughSeq: 1 });

    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chat.id));
    expect(forkMsgs.map((r) => r.content)).toEqual(["kept"]);
  });

  test("D46: a fork carries config picks + REFOLDS the runtime cache from the copied chain", async () => {
    const host = await seedUser(db, "host");
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    // Config plane: the stored ChoiceBlock picks (carried verbatim on fork).
    await db
      .update(chats)
      .set({ variableValues: { pov: "first" } })
      .where(eq(chats.id, chatId));
    // Runtime plane: two committed turns' deltas (X=1 then X=2) — the fork must re-fold, not copy the cache blob.
    const setX = (v: string): VarOp[] => [{ op: "set", key: "hp", value: v }];
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    await db
      .update(messageVariants)
      .set({ variableDelta: setX("1") })
      .where(eq(messageVariants.id, a.variantId));
    const b = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA });
    await db
      .update(messageVariants)
      .set({ variableDelta: setX("2") })
      .where(eq(messageVariants.id, b.variantId));

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId });

    const [forkRow] = await db
      .select({ variableValues: chats.variableValues, runtimeVariables: chats.runtimeVariables })
      .from(chats)
      .where(eq(chats.id, castId(chat.id)));
    expect(forkRow?.variableValues).toEqual({ pov: "first" });
    expect(forkRow?.runtimeVariables).toEqual({ hp: "2" });
  });

  test("D46: a TRUNCATED fork re-folds only the kept chain (not the source's full cache)", async () => {
    const host = await seedUser(db, "host");
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    const setX = (v: string): VarOp[] => [{ op: "set", key: "hp", value: v }];
    const a = await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA });
    await db
      .update(messageVariants)
      .set({ variableDelta: setX("1") })
      .where(eq(messageVariants.id, a.variantId));
    const b = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA });
    await db
      .update(messageVariants)
      .set({ variableDelta: setX("2") })
      .where(eq(messageVariants.id, b.variantId));
    await db
      .update(chats)
      .set({ runtimeVariables: { hp: "2" } })
      .where(eq(chats.id, chatId));

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(host), chatId, throughSeq: 1 });

    const [forkRow] = await db
      .select({ runtimeVariables: chats.runtimeVariables })
      .from(chats)
      .where(eq(chats.id, castId(chat.id)));
    // Only seq 1 was copied → the fork's cache re-folds to X=1, NOT the source's X=2.
    expect(forkRow?.runtimeVariables).toEqual({ hp: "1" });
  });
});

describe("forkChat — D64 cast-drop on a non-owner fork (F4/PD-21 ruling)", () => {
  test("a non-owner fork SUCCEEDS: it drops the un-owned character seats, keeps the forker's cast + the whole history", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    // Single-owner cast (D28): aria belongs to the source HOST, bella to the FORKER. The forker resolves bella
    // but NOT aria → the fork keeps bella's seat, drops aria's — but the CANON (history) is copied whole.
    const aria = await seedCharacter(db, host, "aria");
    const bella = await seedCharacter(db, member, "bella");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "ca", characterId: aria });
    await seedParticipant(db, { chatId, key: "cb", characterId: bella });
    await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: aria,
      content: "from aria",
    });
    await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: bella,
      content: "from bella",
    });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    // The fork exists (the ruling: succeed, don't refuse), the forker is host, the OTHER human is not copied.
    expect(chat.parentChatId).toBe(chatId);
    expect(emitted).toContainEqual({ type: "chatCreated", chatId: chat.id });
    expect(chat.participants.find((p) => p.role === "host")?.userId).toBe(member);
    expect(chat.participants.some((p) => p.userId === host)).toBe(false);
    // The forker's own character seat is KEPT; the un-owned (source host's) seat is DROPPED from the fork roster.
    expect(chat.participants.some((p) => p.characterId === bella)).toBe(true);
    expect(chat.participants.some((p) => p.characterId === aria)).toBe(false);

    // History is copied WHOLE — even the dropped character's prior lines survive in the fork canon.
    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, castId(chat.id)))
      .orderBy(asc(messages.seq));
    expect(forkMsgs.map((r) => r.content)).toEqual(["from aria", "from bella"]);
  });

  test("an OWNER forking their OWN chat is unchanged: every character seat is kept", async () => {
    const host = await seedUser(db, "host");
    const charA = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "src");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "c", characterId: charA });
    await seedMessage(db, chatId, 1, { role: "assistant", characterId: charA, content: "hi" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), {
      emit,
      loadParticipantViews,
    });

    const { chat } = await fork.forkChat({ principal: principal(host), chatId });
    expect(chat.parentChatId).toBe(chatId);
    expect(chat.participants.some((p) => p.characterId === charA)).toBe(true);
    expect(emitted).toContainEqual({ type: "chatCreated", chatId: chat.id });
  });
});

// The D16 join-history floor on the FORK path. `forkChat` is matrix-classified `member`, and the fork is a
// deep COPY into a room where the forker is HOST — so an unfloored copy is a laundering bypass: a `from-join`
// member could fork the source and end up owning the very pre-join transcript `listMessages` withholds. The
// copy floor is the FORKER's own `historyFloorSeq`, resolved at the same chokepoint every read uses.
describe("forkChat — the D16 join-history floor (a fork must not launder pre-join canon)", () => {
  test("a from-join member's fork copies ONLY their own window; the source keeps everything", async () => {
    const host = await seedUser(db, "jhf_host");
    const member = await seedUser(db, "jhf_member");
    const chatId = await seedChat(db, "jhf_src");
    await seedParticipant(db, { chatId, key: "jhf_h", userId: host, role: "host" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join secret" });
    await seedMessage(db, chatId, 2, { role: "user", authorUserId: host, content: "more pre-join" });
    await seedMessage(db, chatId, 3, { role: "assistant", content: "after they joined" });
    // Redeemed at head 3 and host-RESTRICTED to `from-join` (the opt-in clamp; the column default is `full`).
    await seedParticipant(db, { chatId, key: "jhf_m", userId: member, role: "member", joinSeq: 3, joinHistoryVisibility: "from-join" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, castId(chat.id)))
      .orderBy(asc(messages.seq));
    expect(forkMsgs.map((r) => r.content)).toEqual(["after they joined"]);

    // The SOURCE room is untouched — the clamp narrows what the forker may carry, it never deletes canon.
    const srcMsgs = await db.select({ id: messages.id }).from(messages).where(eq(messages.chatId, chatId));
    expect(srcMsgs).toHaveLength(3);
  });

  test("a clamped forker does not carry the compaction checkpoint (it distills the rows their floor hid)", async () => {
    const host = await seedUser(db, "jhk_host");
    const member = await seedUser(db, "jhk_member");
    const chatId = await seedChat(db, "jhk_src");
    await seedParticipant(db, { chatId, key: "jhk_h", userId: host, role: "host" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join secret" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "after they joined" });
    await db.update(chats).set({ compactSummary: "the pre-join story", compactedAtSeq: 1 }).where(eq(chats.id, chatId));
    await seedParticipant(db, { chatId, key: "jhk_m", userId: member, role: "member", joinSeq: 2, joinHistoryVisibility: "from-join" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    const [forkRow] = await db
      .select({ summary: chats.compactSummary, at: chats.compactedAtSeq })
      .from(chats)
      .where(eq(chats.id, castId(chat.id)));
    expect(forkRow?.summary).toBeNull();
    expect(forkRow?.at).toBeNull();
  });

  test("a `full` member's fork is unchanged — the whole source canon + checkpoint carry", async () => {
    const host = await seedUser(db, "jhu_host");
    const member = await seedUser(db, "jhu_member");
    const chatId = await seedChat(db, "jhu_src");
    await seedParticipant(db, { chatId, key: "jhu_h", userId: host, role: "host" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join secret" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "after they joined" });
    await db.update(chats).set({ compactSummary: "the pre-join story", compactedAtSeq: 1 }).where(eq(chats.id, chatId));
    await seedParticipant(db, { chatId, key: "jhu_m", userId: member, role: "member", joinSeq: 2, joinHistoryVisibility: "full" });

    const fork = createFork(makeChatContext(db, { getCard: ownedCard() }), { emit, loadParticipantViews });
    const { chat } = await fork.forkChat({ principal: principal(member), chatId });

    const forkMsgs = await db
      .select({ content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, castId(chat.id)))
      .orderBy(asc(messages.seq));
    expect(forkMsgs.map((r) => r.content)).toEqual(["pre-join secret", "after they joined"]);
    const [forkRow] = await db
      .select({ summary: chats.compactSummary })
      .from(chats)
      .where(eq(chats.id, castId(chat.id)));
    expect(forkRow?.summary).toBe("the pre-join story");
  });
});
