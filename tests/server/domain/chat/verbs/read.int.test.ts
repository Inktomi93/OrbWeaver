// The chat READ SURFACE (`verbs/read.ts`) — proves against a real libSQL db: the listings are MEMBERSHIP-scoped
// (D18 — only the caller's chats), the lineage/fork walks gate per-ancestor INDEPENDENTLY (D27 — a fork grants
// no parent membership), the single reads return the D26 slot⋈variant views, the DRY-RUN previews build the
// prompt WITHOUT persisting or running a turn, the stream-ring reads return the resumable slice, and a
// non-participant is default-denied (leak-free NOT_FOUND). Reached through the BUNDLE `createRead(ctx, deps)`.

import type { ParticipantView } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { chatParticipants, messages } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { ChatNotFoundError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read";
import { freshDb } from "../../../../support/db";
import {
  makeChatContext,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedStreamEvent,
  seedUser,
} from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function principal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

/** Resolve the roster read-model directly off `chat_participants` (the root resolves `users` publics; here the
 *  display name derives from the id — the `fork.ts` test precedent). */
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

/** The read deps — the roster resolver + the (preview-only) connection/assemble resolvers. */
function makeDeps(): Parameters<typeof createRead>[1] {
  return {
    loadParticipantViews,
    resolveConnection: () =>
      Promise.resolve({ model: "test-model" } as unknown as ResolvedConnection),
    resolveForeignInputs: () =>
      Promise.resolve({
        promptConfig: DEFAULT_PROMPT_CONFIG,
        personas: { anchor: null, active: null },
        globalRegexScripts: [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      }),
  };
}

/** Seed a host+character chat where `host` is the room host. */
async function seedRoom(key: string, host: UserId): Promise<ChatId> {
  const chatId = await seedChat(db, key);
  const charA = await seedCharacter(db, host, `${key}_char`);
  await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `${key}_c`, characterId: charA });
  return chatId;
}

describe("read — listings (membership-scoped, D18)", () => {
  test("listChats returns ONLY the caller's chats, with canon stats + participant names", async () => {
    const me = await seedUser(db, "me");
    const other = await seedUser(db, "other");
    const mine = await seedRoom("mine", me);
    const theirs = await seedRoom("theirs", other);
    await seedMessage(db, mine, 1, { role: "user", authorUserId: me, content: "hi" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const chats = await listChats({ principal: principal(me) });

    expect(chats.map((c) => c.id)).toEqual([mine]);
    expect(chats.map((c) => c.id)).not.toContain(theirs);
    expect(chats[0]?.messageCount).toBe(1);
    expect(chats[0]?.lastMessageAt).not.toBeNull();
    expect(chats[0]?.participantNames).toContain(me);
  });

  test("listChats excludes archived unless includeArchived", async () => {
    const me = await seedUser(db, "me");
    const live = await seedChat(db, "live");
    const archived = await seedChat(db, "arch", { archived: true });
    await seedParticipant(db, { chatId: live, key: "l", userId: me, role: "host" });
    await seedParticipant(db, { chatId: archived, key: "a", userId: me, role: "host" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    expect((await listChats({ principal: principal(me) })).map((c) => c.id)).toEqual([live]);
    const all = await listChats({ principal: principal(me), includeArchived: true });
    expect(all.map((c) => c.id).sort()).toEqual([archived, live].sort());
  });
});

describe("read — fork lineage (D27, membership-gated per ancestor)", () => {
  test("listForks returns the fork children the caller is ALSO a member of", async () => {
    const me = await seedUser(db, "me");
    const parent = await seedChat(db, "parent");
    await seedParticipant(db, { chatId: parent, key: "p", userId: me, role: "host" });
    const childMine = await seedChat(db, "child_mine", { parentChatId: parent });
    await seedParticipant(db, { chatId: childMine, key: "cm", userId: me, role: "host" });
    // A fork child of the same parent the caller is NOT a member of (a fork grants no parent membership).
    await seedChat(db, "child_foreign", { parentChatId: parent });

    const { listForks } = createRead(makeChatContext(db), makeDeps());
    const forks = await listForks({ principal: principal(me), chatId: parent });
    expect(forks.map((f) => f.id)).toEqual([childMine]);
  });

  test("getChatLineage walks ancestors root-first; a non-member ancestor is omitted (sparse)", async () => {
    const me = await seedUser(db, "me");
    const root = await seedChat(db, "root");
    const mid = await seedChat(db, "mid", { parentChatId: root });
    const leaf = await seedChat(db, "leaf", { parentChatId: mid });
    // The caller is a member of root + leaf, but NOT mid (the chain is sparse).
    await seedParticipant(db, { chatId: root, key: "r", userId: me, role: "host" });
    await seedParticipant(db, { chatId: leaf, key: "lf", userId: me, role: "host" });

    const { getChatLineage } = createRead(makeChatContext(db), makeDeps());
    const { chain } = await getChatLineage({ principal: principal(me), chatId: leaf });
    expect(chain.map((c) => c.id)).toEqual([root, leaf]);
  });
});

describe("read — single reads", () => {
  test("getChat returns the detail (roster + default room behavior)", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);

    const { getChat } = createRead(makeChatContext(db), makeDeps());
    const detail = await getChat({ principal: principal(me), chatId });
    expect(detail.id).toBe(chatId);
    expect(detail.participants.some((p) => p.role === "host" && p.userId === me)).toBe(true);
    expect(detail.group.output).toBe("per-speaker"); // DEFAULT_GROUP_CONFIG applied
    expect(detail.opening).toBeNull();
  });

  test("listMessages returns the D26 slot⋈variant views in chronological order; hidden flag rides", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "first" });
    await seedMessage(db, chatId, 2, {
      role: "assistant",
      content: "second",
      excludedFromPrompt: true,
    });
    await seedMessage(db, chatId, 3, { role: "user", authorUserId: me, content: "third" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const all = await listMessages({ principal: principal(me), chatId });
    expect(all.map((m) => m.content)).toEqual(["first", "second", "third"]);
    expect(all[1]?.excludedFromPrompt).toBe(true);

    // Paging: a backward window before seq 3 returns the older two, still chronological.
    const page = await listMessages({ principal: principal(me), chatId, beforeSeq: 3, limit: 1 });
    expect(page.map((m) => m.content)).toEqual(["second"]);
  });

  test("listParticipants returns the present roster", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);

    const { listParticipants } = createRead(makeChatContext(db), makeDeps());
    const roster = await listParticipants({ principal: principal(me), chatId });
    expect(roster.some((p) => p.userId === me && p.role === "host")).toBe(true);
    expect(roster.some((p) => p.kind === "character")).toBe(true);
  });
});

describe("read — dry-run prompt previews (NO persist, NO turn)", () => {
  test("peekPrompt + previewAssembly build the prompt without persisting or emitting", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "hi" });

    const { peekPrompt, previewAssembly } = createRead(makeChatContext(db), makeDeps());
    const prompt = await peekPrompt({ principal: principal(me), chatId });
    expect(typeof prompt.static).toBe("string");
    const preview = await previewAssembly({ principal: principal(me), chatId });
    expect(preview.prompt.static).toBe(prompt.static);
    expect(preview.trace).toBe(preview.prompt.trace);

    // No new canon was written by the previews (the one seeded message is unchanged).
    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(1);
  });

  test("getActivePresetConfig returns the resolved PromptConfig", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);

    const { getActivePresetConfig } = createRead(makeChatContext(db), makeDeps());
    const config = await getActivePresetConfig({ principal: principal(me), chatId });
    expect(config.sections.length).toBe(DEFAULT_PROMPT_CONFIG.sections.length);
  });

  test("previewSection renders a known section; an unknown sectionId is NOT_FOUND", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    const sectionId = DEFAULT_PROMPT_CONFIG.sections[0]?.id ?? "main";

    const { previewSection } = createRead(makeChatContext(db), makeDeps());
    const section = await previewSection({ principal: principal(me), chatId, sectionId });
    expect(section.half === "static" || section.half === "dynamic").toBe(true);

    await expect(
      previewSection({ principal: principal(me), chatId, sectionId: "no-such-section" }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});

describe("read — resumable stream ring", () => {
  test("replayStreamEvents resumes after a cursor; streamEventBounds reports min/max", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    await seedStreamEvent(db, chatId, 1, "a");
    await seedStreamEvent(db, chatId, 2, "b");
    await seedStreamEvent(db, chatId, 3, "c");

    const { replayStreamEvents, streamEventBounds } = createRead(makeChatContext(db), makeDeps());
    const tail = await replayStreamEvents({ principal: principal(me), chatId, afterSeq: 1 });
    expect(tail.map((e) => e.delta)).toEqual(["b", "c"]);
    const bounds = await streamEventBounds({ principal: principal(me), chatId });
    expect(bounds).toEqual({ minSeq: 1, maxSeq: 3 });
  });
});

describe("read — default-deny (membership chokepoint)", () => {
  test("a non-participant gets a leak-free NOT_FOUND on every chatId read", async () => {
    const me = await seedUser(db, "me");
    const stranger = await seedUser(db, "stranger");
    const chatId = await seedRoom("room", me);

    const read = createRead(makeChatContext(db), makeDeps());
    const p = principal(stranger);
    await expect(read.getChat({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.listMessages({ principal: p, chatId })).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
    await expect(read.listParticipants({ principal: p, chatId })).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
    await expect(read.peekPrompt({ principal: p, chatId })).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
    await expect(read.streamEventBounds({ principal: p, chatId })).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
    // A non-member of the parent cannot list its forks either.
    await expect(read.listForks({ principal: p, chatId })).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
  });
});
