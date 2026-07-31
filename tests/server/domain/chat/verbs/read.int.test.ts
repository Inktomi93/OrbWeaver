// The chat READ SURFACE (`verbs/read.ts`) — proves against a real libSQL db: the listings are MEMBERSHIP-scoped
// (D18 — only the caller's chats), the lineage/fork walks gate per-ancestor INDEPENDENTLY (D27 — a fork grants
// no parent membership), the single reads return the D26 slot⋈variant views, the DRY-RUN previews build the
// prompt WITHOUT persisting or running a turn, the stream-ring reads return the resumable slice, and a
// non-participant is default-denied (leak-free NOT_FOUND). Reached through the BUNDLE `createRead(ctx, deps)`.

import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona, MemberCardVisibility } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { characterBooks, chatParticipants, chats as chatsTable, messages, worldBooks, worldEntries } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, Handle, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import { createChatBus } from "../../../../../packages/server/src/domain/chat/bus";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { upsertMemberOnJoin } from "../../../../../packages/server/src/domain/chat/persistence/participant";
import { loadMessageView } from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { createRead } from "../../../../../packages/server/src/domain/chat/verbs/read";
// The D16 policy SETTER (verbs/roster.ts) — imported here so the round-trip tests below drive the real
// write path against the real read clamp in one room (the setter's own gates live in roster.int.test.ts).
import { createRoster } from "../../../../../packages/server/src/domain/chat/verbs/roster";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { makeModelCapability, makeResolvedConnection } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  addVariant,
  FROZEN_AT,
  makeChatContext,
  makeLoadParticipantViews,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedPersona,
  seedStreamEvent,
  seedUser,
} from "../_support";

let db: Db;
let loadParticipantViews: ReturnType<typeof makeLoadParticipantViews>;

beforeEach(async () => {
  db = await freshDb();
  loadParticipantViews = makeLoadParticipantViews(db);
});

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** The read deps — the roster resolver + the (preview-only) connection/assemble resolvers. */
function makeDeps(overrides?: Partial<Parameters<typeof createRead>[1]>): Parameters<typeof createRead>[1] {
  return {
    loadParticipantViews,
    resolveConnection: () => Promise.resolve({ model: "test-model" } as unknown as ResolvedConnection),
    checkSendAvailability: () => Promise.resolve({ available: true }),
    resolveForeignInputs: () =>
      Promise.resolve({
        promptConfig: DEFAULT_PROMPT_CONFIG,
        personas: { anchor: null, active: null },
        globalRegexScripts: [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      }),
    // LAST so a caller can actually override any dep — the spread used to sit ABOVE `resolveForeignInputs`,
    // which silently ignored a foreign-inputs override (a test could not vary the preset).
    ...overrides,
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

  test("listChats derives viewerRole per-caller from the roster (host vs member)", async () => {
    const me = await seedUser(db, "me");
    const other = await seedUser(db, "other");
    // A chat I host, and a chat someone else hosts where I am a plain member.
    const hosted = await seedRoom("hosted", me);
    const guested = await seedRoom("guested", other);
    await seedParticipant(db, { chatId: guested, key: "guested_me", userId: me, role: "member" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    const byId = new Map((await listChats({ principal: principal(me) })).map((c) => [c.id, c.viewerRole]));

    expect(byId.get(hosted)).toBe("host");
    expect(byId.get(guested)).toBe("member");
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

  test("listChats ALWAYS hides temporary chats (ST Temporary Chat, PD-65)", async () => {
    const me = await seedUser(db, "me");
    const normal = await seedChat(db, "normal");
    const temp = await seedChat(db, "temp", { temporary: true });
    await seedParticipant(db, { chatId: normal, key: "n", userId: me, role: "host" });
    await seedParticipant(db, { chatId: temp, key: "t", userId: me, role: "host" });

    const { listChats } = createRead(makeChatContext(db), makeDeps());
    expect((await listChats({ principal: principal(me) })).map((c) => c.id)).toEqual([normal]);
    // includeArchived widens the archive filter only — a temporary chat never surfaces in the library.
    const all = await listChats({ principal: principal(me), includeArchived: true });
    expect(all.map((c) => c.id)).toEqual([normal]);
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
    // The participant-scoped macro name producer (Chat-Macro-Resolution.md §1) covers the roster's character.
    expect(detail.macroNames.characterNames.some((c) => c.name === "room_char")).toBe(true);
    // The viewer-scoped fields (host-of-this-room, no persona set yet).
    expect(detail.viewerUserId).toBe(me);
    expect(detail.viewerIsHost).toBe(true);
    expect(detail.viewerActivePersonaId).toBeNull();
  });

  test("getChat's viewerActivePersonaId reflects a setActivePersona write (chat_participants.activePersonaId)", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    const personaId = await seedPersona(db, me, "worn");
    // `persona.setActivePersona` ultimately writes this same column (`setParticipantActivePersona`,
    // verbs/roster.ts) — seeding it directly proves getChat's VIEW reads what that write produces.
    await db
      .update(chatParticipants)
      .set({ activePersonaId: personaId })
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, me)));

    const { getChat } = createRead(makeChatContext(db), makeDeps());
    const detail = await getChat({ principal: principal(me), chatId });
    expect(detail.viewerActivePersonaId).toBe(personaId);
  });

  test("getChat's viewerIsHost is false for a present MEMBER (not the host)", async () => {
    const host = await seedUser(db, "host2");
    const member = await seedUser(db, "member2");
    const chatId = await seedRoom("room2", host);
    await seedParticipant(db, { chatId, key: "room2_m", userId: member, role: "member" });

    const { getChat } = createRead(makeChatContext(db), makeDeps());
    const detail = await getChat({ principal: principal(member), chatId });
    expect(detail.viewerUserId).toBe(member);
    expect(detail.viewerIsHost).toBe(false);
    expect(detail.viewerActivePersonaId).toBeNull();
  });

  // #54 — the honest-refusal pre-send gate. The verb resolves the room host, calls the injected
  // deterministic verdict (no turn fired), and is member-gated; a non-participant/hostless room is a
  // leak-free NOT_FOUND. The verdict-classification itself is proven in connection/verbs/check-chat-
  // availability.int.test.ts; here we prove the chat-verb WIRING (host resolution + gate + pass-through).
  test("checkSendAvailability returns the injected verdict for a member (available)", async () => {
    const host = await seedUser(db, "avail_host");
    const chatId = await seedRoom("avail_room", host);

    const { checkSendAvailability } = createRead(makeChatContext(db), makeDeps());
    const verdict = await checkSendAvailability({ principal: principal(host), chatId });
    expect(verdict).toEqual({ available: true });
  });

  test("checkSendAvailability passes an UNAVAILABLE verdict through (engine-off)", async () => {
    const host = await seedUser(db, "off_host");
    const chatId = await seedRoom("off_room", host);

    const { checkSendAvailability } = createRead(
      makeChatContext(db),
      makeDeps({ checkSendAvailability: () => Promise.resolve({ available: false, cause: "engine-off" }) }),
    );
    const verdict = await checkSendAvailability({ principal: principal(host), chatId });
    expect(verdict).toEqual({ available: false, cause: "engine-off" });
  });

  test("checkSendAvailability is member-gated — a non-participant is a leak-free NOT_FOUND", async () => {
    const host = await seedUser(db, "gate_host");
    const stranger = await seedUser(db, "gate_stranger");
    const chatId = await seedRoom("gate_room", host);

    const { checkSendAvailability } = createRead(makeChatContext(db), makeDeps());
    await expect(checkSendAvailability({ principal: principal(stranger), chatId })).rejects.toThrow(ChatNotFoundError);
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
    expect(all.messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
    expect(all.messages[1]?.excludedFromPrompt).toBe(true);

    // Paging: a backward window before seq 3 returns the older two, still chronological.
    const page = await listMessages({ principal: principal(me), chatId, beforeSeq: 3, limit: 1 });
    expect(page.messages.map((m) => m.content)).toEqual(["second"]);
  });

  test("listMessages' macroNames covers the roster's character AND a message-stamped persona not on the roster (Chat-Macro-Resolution.md §1)", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    const oldPersona = await seedPersona(db, me, "old_persona");
    // A since-switched persona: stamped on a message but not any participant's CURRENT active persona.
    await seedMessage(db, chatId, 1, { role: "user", personaId: oldPersona, content: "hi" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const { macroNames } = await listMessages({ principal: principal(me), chatId });
    expect(macroNames.characterNames.some((c) => c.name === "room_char")).toBe(true);
    expect(macroNames.personaNames.some((p) => p.id === oldPersona)).toBe(true);
  });

  test("listMessageVariants returns the full sibling set ordered by idx, no content", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const v1 = await addVariant(db, messageId, 1, "second take");

    const { listMessageVariants } = createRead(makeChatContext(db), makeDeps());
    const variants = await listMessageVariants({ principal: principal(me), chatId, messageId });
    expect(variants).toStrictEqual([
      { variantId, idx: 0 },
      { variantId: v1, idx: 1 },
    ]);
  });

  test("listMessageVariants is leak-free NOT_FOUND for a foreign-chat messageId (member of the caller's chat, not this slot's)", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    const other = await seedRoom("other", me);
    const { messageId } = await seedMessage(db, other, 1);

    const { listMessageVariants } = createRead(makeChatContext(db), makeDeps());
    await expect(listMessageVariants({ principal: principal(me), chatId, messageId })).rejects.toBeInstanceOf(ChatNotFoundError);
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D16 `joinHistoryVisibility` — the per-participant confidentiality policy (`chat_participants`,
// `.notNull().default("full")` — an invited member sees the room's whole history; `from-join` is the host's
// OPT-IN restriction, so every test below whose subject is the CLAMP spells it out).
// It was PERSISTED AND NEVER READ: a live multi-human drive found that a
// human invited at canon head 7 received `listMessages` seqs 1-7 (the host's pre-join greetings included)
// and a `lastEventId:"0"` subscribe replayed the whole durable log. The floor is resolved ONCE at the
// membership chokepoint (`guard.requireParticipant` → `substrate/auth::resolveHistoryFloorSeq`) and every
// read path that can surface pre-join canon consumes it. These are the LIVE REPRO, pinned.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("read — the D16 join-history floor (joinHistoryVisibility)", () => {
  /** A room with 4 canon rows: two host greetings (seq 1-2) then two later turns (seq 3-4). */
  async function seedRoomWithHistory(key: string, host: UserId): Promise<ChatId> {
    const chatId = await seedRoom(key, host);
    await seedMessage(db, chatId, 1, { role: "assistant", content: "greeting one" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "greeting two" });
    await seedMessage(db, chatId, 3, { role: "user", authorUserId: host, content: "private chatter" });
    await seedMessage(db, chatId, 4, { role: "assistant", content: "after the join" });
    return chatId;
  }

  test("a from-join member cannot read canon below their joinSeq (the live repro: greetings + pre-join rows absent)", async () => {
    const host = await seedUser(db, "jh_host");
    const joiner = await seedUser(db, "jh_joiner");
    const chatId = await seedRoomWithHistory("jh", host);
    // The invite-redeem shape: role `member`, joinSeq stamped at the canon head when they joined (4 rows
    // existed, so the FIRST row they may see is seq 4 — the floor is INCLUSIVE). The host RESTRICTED this
    // member to `from-join`; the column default (`full`) is pinned separately below.
    await seedParticipant(db, { chatId, key: "jh_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const page = await listMessages({ principal: principal(joiner), chatId });

    expect(page.messages.map((m) => m.seq)).toEqual([4]);
    const body = JSON.stringify(page.messages);
    expect(body).not.toContain("greeting one");
    expect(body).not.toContain("greeting two");
    expect(body).not.toContain("private chatter");
  });

  // F2 — the host has full control (owner ratified). A PROMOTED host is a member who joined late under a
  // `from-join` restriction and was then handed the host seat: the seat flips to `host`, but the row's
  // `joinSeq`/`joinHistoryVisibility` do NOT. Before F2 their `listMessages` still withheld pre-join history
  // (their old member floor) while export-chat + discovery already handed them full canon — an incoherent
  // split. The derive now floors a HOST at 0 in the ONE resolver, so `listMessages` sees the whole transcript.
  test("a PROMOTED host (from-join row, late joinSeq) reads the WHOLE pre-join history — F2 host full control", async () => {
    const founder = await seedUser(db, "f2_founder");
    const promoted = await seedUser(db, "f2_promoted");
    const chatId = await seedRoomWithHistory("f2", founder);
    // The row a host-handoff leaves on a formerly-clamped member: role `host`, but joinSeq 4 + from-join intact.
    await seedParticipant(db, { chatId, key: "f2_p", userId: promoted, role: "host", joinSeq: 4, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const page = await listMessages({ principal: principal(promoted), chatId });

    expect(page.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    const body = JSON.stringify(page.messages);
    expect(body).toContain("greeting one");
    expect(body).toContain("private chatter");
  });

  // THE DEFAULT, pinned end-to-end. Owner ruling: "if you are inviting someone into a group chat they should
  // be able to view previous turns." So a member seeded with NO policy — the shape a real invite redeem
  // writes, which never names the column — must read the ENTIRE canon, including rows below their `joinSeq`.
  // This is the guard against a future schema edit silently re-restricting every invitee.
  test("the COLUMN DEFAULT is `full`: a member joined at head 4 with NO explicit policy reads the whole history", async () => {
    const host = await seedUser(db, "jhd_host");
    const joiner = await seedUser(db, "jhd_joiner");
    const chatId = await seedRoomWithHistory("jhd", host);
    const participantId = await seedParticipant(db, { chatId, key: "jhd_m", userId: joiner, role: "member", joinSeq: 4 });

    // The persisted policy itself — the default the DB wrote, not a value any caller supplied.
    const row = await db.select().from(chatParticipants).where(eq(chatParticipants.id, participantId));
    expect(row.at(0)?.joinHistoryVisibility).toBe("full");

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const page = await listMessages({ principal: principal(joiner), chatId });
    expect(page.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(page.messages)).toContain("greeting one");
  });

  test("a `full` member DOES see everything — the policy's other arm actually works", async () => {
    const host = await seedUser(db, "jhf_host");
    const joiner = await seedUser(db, "jhf_joiner");
    const chatId = await seedRoomWithHistory("jhf", host);
    await seedParticipant(db, { chatId, key: "jhf_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "full" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    const page = await listMessages({ principal: principal(joiner), chatId });
    expect(page.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  });

  // THE ROUND TRIP — the setter wired to the enforcement. The mechanism above was complete and unreachable
  // (no write path existed anywhere: only a manual SQL edit produced `from-join`). These two prove the host's
  // verb actually moves what the member reads, in both directions, with no other wiring.
  test("the host RESTRICTS a member (setMemberHistoryVisibility → from-join) and their next listMessages is clamped at their joinSeq", async () => {
    const host = await seedUser(db, "jhw_host");
    const joiner = await seedUser(db, "jhw_joiner");
    const chatId = await seedRoomWithHistory("jhw", host);
    // The invite-redeem shape: no explicit policy → the `full` column default. They read everything first.
    await seedParticipant(db, { chatId, key: "jhw_m", userId: joiner, role: "member", joinSeq: 4 });
    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);

    const roster = createRoster(makeChatContext(db), { emit: async (): Promise<void> => undefined });
    await roster.setMemberHistoryVisibility({ principal: principal(host), chatId, userId: joiner, visibility: "from-join" });

    const after = await listMessages({ principal: principal(joiner), chatId });
    expect(after.messages.map((m) => m.seq)).toEqual([4]);
    expect(JSON.stringify(after.messages)).not.toContain("private chatter");
    // The restriction never moved their join point — it only changed what they may read from it.
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.joinSeq).toBe(4);
  });

  test("the host RESTORES a member (→ full) and they read the whole canon again", async () => {
    const host = await seedUser(db, "jhwr_host");
    const joiner = await seedUser(db, "jhwr_joiner");
    const chatId = await seedRoomWithHistory("jhwr", host);
    await seedParticipant(db, { chatId, key: "jhwr_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });
    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([4]);

    const roster = createRoster(makeChatContext(db), { emit: async (): Promise<void> => undefined });
    await roster.setMemberHistoryVisibility({ principal: principal(host), chatId, userId: joiner, visibility: "full" });

    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  });

  test("the HOST is never clamped by a member's floor (the clamp is per-CALLER)", async () => {
    const host = await seedUser(db, "jhh_host");
    const joiner = await seedUser(db, "jhh_joiner");
    const chatId = await seedRoomWithHistory("jhh", host);
    await seedParticipant(db, { chatId, key: "jhh_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    expect((await listMessages({ principal: principal(host), chatId })).messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    // …and the clamped member in the SAME room still only sees their own window.
    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([4]);
  });

  test("pagination stays honest: a beforeSeq cursor at/below the floor is an EMPTY page, never a fabricated one", async () => {
    const host = await seedUser(db, "jhp_host");
    const joiner = await seedUser(db, "jhp_joiner");
    const chatId = await seedRoomWithHistory("jhp", host);
    await seedParticipant(db, { chatId, key: "jhp_m", userId: joiner, role: "member", joinSeq: 3, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    // The member's window is seq 3-4; walking back from 4 yields the floor row, then nothing.
    expect((await listMessages({ principal: principal(joiner), chatId, beforeSeq: 4 })).messages.map((m) => m.seq)).toEqual([3]);
    const exhausted = await listMessages({ principal: principal(joiner), chatId, beforeSeq: 3 });
    expect(exhausted.messages).toEqual([]);
    // The terminal page is truthful, not a re-served window: nothing below the floor is smuggled in.
    expect(JSON.stringify(exhausted.messages)).not.toContain("greeting");
  });

  test("the compaction checkpoint is withheld from a clamped member (a summary distills the canon their floor hides)", async () => {
    const host = await seedUser(db, "jhc_host");
    const joiner = await seedUser(db, "jhc_joiner");
    const chatId = await seedRoomWithHistory("jhc", host);
    await seedParticipant(db, { chatId, key: "jhc_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });
    await db.update(chatsTable).set({ compactSummary: "the pre-join story so far", compactedAtSeq: 3 }).where(eq(chatsTable.id, chatId));

    const { getChat } = createRead(makeChatContext(db), makeDeps());
    const hostDetail = await getChat({ principal: principal(host), chatId });
    expect(hostDetail.compactSummary).toBe("the pre-join story so far");
    expect(hostDetail.compactedAtSeq).toBe(3);

    const memberDetail = await getChat({ principal: principal(joiner), chatId });
    expect(memberDetail.compactSummary).toBeNull();
    expect(memberDetail.compactedAtSeq).toBeNull();
  });

  test("the durable replay from lastEventId:'0' hands a clamped member NO pre-join content", async () => {
    const host = await seedUser(db, "jhr_host");
    const joiner = await seedUser(db, "jhr_joiner");
    const chatId = await seedRoom("jhr", host);
    const pre = await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join greeting" });
    const post = await seedMessage(db, chatId, 5, { role: "assistant", content: "post-join reply" });
    await seedParticipant(db, { chatId, key: "jhr_m", userId: joiner, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });

    // Emit through the REAL durable-first bus, in the order a live room produces: a pre-join commit, the raw
    // token deltas of that pre-join turn, then a post-join commit — plus a POST-join EDIT of the PRE-join row
    // (the case a cursor floor alone would let straight through: high durable seq, low view seq), and finally
    // the token stream of a turn writing INTO the post-join slot (the member's own content).
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const preView = await loadMessageView(db, pre.messageId);
    const postView = await loadMessageView(db, post.messageId);
    await bus.emit({ type: "messageCommitted", chatId, messageId: pre.messageId, ...(preView === undefined ? {} : { view: preView }) });
    // slotSeq 1 = the PRE-join slot these tokens fill (a host swiping/continuing that old row streams exactly
    // this) — below the joiner's floor, so it must not reach them.
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "pre-join greeting" } });
    await bus.emit({ type: "messageCommitted", chatId, messageId: post.messageId, ...(postView === undefined ? {} : { view: postView }) });
    await bus.emit({ type: "messageEdited", chatId, messageId: pre.messageId, ...(preView === undefined ? {} : { view: preView }) });
    // slotSeq 5 = the POST-join slot — at the joiner's floor, so its tokens ARE theirs to stream.
    await bus.emit({ type: "delta", chatId, slotSeq: 5, delta: { chatId, kind: "text", text: "post-join tokens" } });

    const { replayChatEvents } = createRead(ctx, makeDeps());
    // `afterSeq: 0` IS the client's `lastEventId:"0"` seed — the exact live repro cursor.
    const replayed = await replayChatEvents({ principal: principal(joiner), chatId, afterSeq: 0 });

    expect(JSON.stringify(replayed)).not.toContain("pre-join greeting");
    // The member receives their OWN post-join commit AND the post-join slot's token stream, each at its true
    // durable cursor (withheld rows leave a seq gap; the cursor is never rewritten). Deltas are clamped
    // per-ROW, not blanket-withheld — a clamped member still gets streaming for content that is theirs.
    expect(replayed.map((e) => e.seq)).toEqual([3, 5]);
    expect(replayed.map((e) => e.event.type)).toEqual(["messageCommitted", "delta"]);
    expect(JSON.stringify(replayed)).toContain("post-join tokens");

    // The host, unclamped, still gets the whole log — the clamp is per-CALLER.
    const hostReplay = await replayChatEvents({ principal: principal(host), chatId, afterSeq: 0 });
    expect(hostReplay.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  // The SSE attach probe is the seam that carries the floor OUT of the domain: `chat.streamMessages` tails an
  // in-process fan-out keyed by chatId only, so the transport must be handed a per-CALLER floor to clamp the
  // LIVE half with (the durable half is clamped in `replayChatEvents` above). Pinned here at the source —
  // the transport's use of it is pinned in `tests/server/transport/trpc/routers/chat.int.test.ts`.
  test("chatEventBounds carries the CALLER's own floor — clamped for the joiner, 0 for the host, from one member-gated read", async () => {
    const host = await seedUser(db, "jhb_host");
    const joiner = await seedUser(db, "jhb_joiner");
    const chatId = await seedRoomWithHistory("jhb", host);
    await seedParticipant(db, { chatId, key: "jhb_m", userId: joiner, role: "member", joinSeq: 4, joinHistoryVisibility: "from-join" });

    const { chatEventBounds } = createRead(makeChatContext(db), makeDeps());
    expect((await chatEventBounds({ principal: principal(joiner), chatId })).historyFloorSeq).toBe(4);
    // Same probe, same room, same instant — the host is never clamped by the member's policy.
    expect((await chatEventBounds({ principal: principal(host), chatId })).historyFloorSeq).toBe(0);
  });

  test("a `full` member's durable replay is unchanged (the other arm, on the event path too)", async () => {
    const host = await seedUser(db, "jhrf_host");
    const joiner = await seedUser(db, "jhrf_joiner");
    const chatId = await seedRoom("jhrf", host);
    const pre = await seedMessage(db, chatId, 1, { role: "assistant", content: "pre-join greeting" });
    await seedParticipant(db, { chatId, key: "jhrf_m", userId: joiner, role: "member", joinSeq: 5, joinHistoryVisibility: "full" });

    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const preView = await loadMessageView(db, pre.messageId);
    await bus.emit({ type: "messageCommitted", chatId, messageId: pre.messageId, ...(preView === undefined ? {} : { view: preView }) });
    // A delta anchored to the PRE-join slot — withheld from a `from-join` member, delivered here.
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "pre-join greeting" } });

    const { replayChatEvents } = createRead(ctx, makeDeps());
    const replayed = await replayChatEvents({ principal: principal(joiner), chatId, afterSeq: 0 });
    expect(replayed.map((e) => e.seq)).toEqual([1, 2]);
    expect(JSON.stringify(replayed)).toContain("pre-join greeting");
  });

  // RE-JOIN semantics, driven through the REAL membership write (`upsertMemberOnJoin` — the one human-join
  // path both invite redeem and accept-by-id call). A human's membership is ONE upserted row: the re-join
  // re-stamps `joinSeq` to the current head, clears `leftSeq`, and does NOT touch `joinHistoryVisibility`.
  // So a `from-join` member who left and came back is floored at their LATEST join and loses their PREVIOUS
  // era — the row retains no era history, so that is the only reading it can support (and the conservative
  // one). Pinned because it is surprising, not because it is a preference.
  test("a re-joined from-join member is floored at their LATEST joinSeq (their previous era is not re-granted)", async () => {
    const host = await seedUser(db, "jhrj_host");
    const joiner = await seedUser(db, "jhrj_joiner");
    const chatId = await seedRoomWithHistory("jhrj", host);
    // First era: joined at head 1, so seqs 1-4 were all visible to them at the time.
    await seedParticipant(db, { chatId, key: "jhrj_m", userId: joiner, role: "member", joinSeq: 1, leftSeq: 2, joinHistoryVisibility: "from-join" });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());
    // Re-invited at the current head (4) — the same write a redeem performs.
    const rejoined = await upsertMemberOnJoin(db, { participantId: castId("chat_participant_unused"), chatId, userId: joiner, joinSeq: 4, now: FROZEN_AT });
    expect(rejoined?.joinSeq).toBe(4);
    expect(rejoined?.joinHistoryVisibility).toBe("from-join"); // untouched by the re-join upsert

    expect((await listMessages({ principal: principal(joiner), chatId })).messages.map((m) => m.seq)).toEqual([4]);
  });

  test("the SSE token-log replay is clamped too (raw transcript text anchored to a pre-join slot)", async () => {
    const host = await seedUser(db, "jhs_host");
    const joiner = await seedUser(db, "jhs_joiner");
    const chatId = await seedRoom("jhs", host);
    const pre = await seedMessage(db, chatId, 1, { role: "assistant", content: "pre" });
    const post = await seedMessage(db, chatId, 5, { role: "assistant", content: "post" });
    await seedParticipant(db, { chatId, key: "jhs_m", userId: joiner, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });
    await seedStreamEvent(db, chatId, 1, { delta: "pre-join tokens", messageId: pre.messageId });
    await seedStreamEvent(db, chatId, 2, { delta: "post-join tokens", messageId: post.messageId });

    const { replayStreamEvents } = createRead(makeChatContext(db), makeDeps());
    expect((await replayStreamEvents({ principal: principal(joiner), chatId })).map((e) => e.delta)).toEqual(["post-join tokens"]);
    expect((await replayStreamEvents({ principal: principal(host), chatId })).map((e) => e.delta)).toEqual(["pre-join tokens", "post-join tokens"]);
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
    // The activated-WI list reaches the wire trace (freshTrace → prompt.trace passthrough); this room has no
    // firing lore, so the honest surface is the empty set — the panel renders its "none activated" explanation.
    expect(preview.trace.worldInfoActivated).toEqual([]);

    // No new canon was written by the previews (the one seeded message is unchanged).
    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(1);
  });

  test("peekPrompt + previewAssembly are HOST-only; a present non-host member is refused (not_host)", async () => {
    // The full assembled prompt merges every roster member's card at FULL — exposing it to a plain member
    // would bypass the D22 `memberCardVisibility` clamp. Both verbs gate at `requireHost` (matrix `host`).
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedRoom("room", host);
    await seedParticipant(db, { chatId, key: "room_m", userId: member, role: "member" });

    const { peekPrompt, previewAssembly } = createRead(makeChatContext(db), makeDeps());

    // The host reads both.
    expect(typeof (await peekPrompt({ principal: principal(host), chatId })).static).toBe("string");
    expect(typeof (await previewAssembly({ principal: principal(host), chatId })).prompt.static).toBe("string");

    // The present member is refused (known-existence authority refusal — the client mounts these host-only).
    const peekErr = await peekPrompt({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(peekErr).toBeInstanceOf(ChatOperationError);
    expect((peekErr as ChatOperationError).code).toBe("not_host");

    const previewErr = await previewAssembly({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(previewErr).toBeInstanceOf(ChatOperationError);
    expect((previewErr as ChatOperationError).code).toBe("not_host");
  });

  test("previewAssembly routes a guided steer through the SAME assembly a real turn gets (PD-63)", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);

    const { previewAssembly } = createRead(makeChatContext(db), makeDeps());
    const steered = await previewAssembly({
      principal: principal(me),
      chatId,
      guided: { action: "response", input: "be dramatic" },
    });
    // The default `response` template (system-marker placement) renders in the dynamic half; the trace
    // records the inclusion.
    expect(steered.trace.guidedInstructionIncluded).toBe(true);
    expect(steered.prompt.dynamic).toContain("be dramatic");

    const plain = await previewAssembly({ principal: principal(me), chatId });
    expect(plain.trace.guidedInstructionIncluded).toBe(false);
    expect(plain.prompt.dynamic).not.toContain("be dramatic");
  });

  test("previewAssembly's BUDGET partitions the next turn's context by source (D-4)", async () => {
    // The host preview's honesty contract: `Σ sources[].tokens === totalTokens`, every source's `text` is
    // text the model actually receives, the ceiling is the SAME `min(window, maxContextTokens)` the fit uses,
    // and a PLAIN chat carries no `game-state` row.
    const me = await seedUser(db, "budget_host");
    const chatId = await seedRoom("budget", me);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "the older turn" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "a reply worth some tokens" });

    const capability = makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 8192 } });
    const { previewAssembly } = createRead(makeChatContext(db), makeDeps({ resolveConnection: () => Promise.resolve(makeResolvedConnection({ capability })) }));
    const { budget, prompt } = await previewAssembly({ principal: principal(me), chatId });

    expect(budget.sources.reduce((sum, s) => sum + s.tokens, 0)).toBe(budget.totalTokens);
    expect(budget.totalTokens).toBeGreaterThan(0);
    expect(budget.ceilingTokens).toBe(8192);
    // The preset sections land in `system`, and the drill-in body is the assembled text VERBATIM (the panel
    // shows what the wire carries, never a re-derivation).
    const system = budget.sources.find((s) => s.source === "system");
    expect(system?.tokens).toBeGreaterThan(0);
    expect(prompt.static).toContain(system?.text ?? "<no system slice>");
    // History is accounted by COST, never re-served as content.
    const history = budget.sources.find((s) => s.source === "history");
    expect(history?.text).toBe("");
    expect(history?.tokens).toBeGreaterThan(0);
    expect(history?.detail).toBe("2 turns");
    // A plain chat has no game row (the row is game-conditional, not a zero-width segment).
    expect(budget.sources.some((s) => s.source === "game-state")).toBe(false);
  });

  test("a two-character room reports what EACH member costs, by their card name (owner ruling)", async () => {
    // "The context panel definitely has the current characters' total token size that are in the room."
    // The BUDGET's `cards` row must therefore break down per ROSTER MEMBER — real names, real token counts,
    // resolved through the same `getCard` op the turn assembles from (no client-side guessing, no shim).
    const me = await seedUser(db, "cast_host");
    const chatId = await seedChat(db, "cast");
    const maraId = await seedCharacter(db, me, "mara");
    const nikoId = await seedCharacter(db, me, "niko");
    await seedParticipant(db, { chatId, key: "cast_h", userId: me, role: "host" });
    await seedParticipant(db, { chatId, key: "cast_mara", characterId: maraId });
    await seedParticipant(db, { chatId, key: "cast_niko", characterId: nikoId });

    const cards: Record<string, { name: string; description: string; regexScripts: [] }> = {
      [maraId]: { name: "Mara", description: "A bold knight of the Lantern Road who never yields her post.", regexScripts: [] },
      [nikoId]: { name: "Niko", description: "A wary scout.", regexScripts: [] },
    };
    const ctx = makeChatContext(db, {
      // FABRICATION-OK: minimal CharacterCard doubles — assembly reads name + description off these.
      getCard: ({ characterId }) => Promise.resolve((cards[characterId] ?? null) as unknown as CharacterCard),
    });

    const { budget } = await createRead(ctx, makeDeps()).previewAssembly({ principal: principal(me), chatId });

    const cardsRow = budget.sources.find((s) => s.source === "cards");
    // Both present members are named — the detail line AND a part apiece with its own real token count.
    expect(cardsRow?.detail).toBe("Mara · Niko");
    expect(cardsRow?.parts.map((p) => p.label)).toEqual(["Mara", "Niko"]);
    expect(cardsRow?.parts.every((p) => p.tokens > 0)).toBe(true);
    // Mara's card is the longer one, so she costs more — the numbers track the actual bytes, not a stub.
    const mara = cardsRow?.parts.find((p) => p.label === "Mara");
    const niko = cardsRow?.parts.find((p) => p.label === "Niko");
    expect(mara?.tokens ?? 0).toBeGreaterThan(niko?.tokens ?? 0);
    expect(mara?.text).toContain("Lantern Road");
    expect(niko?.text).toContain("wary scout");
    // …and each member's bytes are bytes the model actually receives.
    expect(cardsRow?.text).toBe([mara?.text, niko?.text].join("\n\n"));
  });

  test("the budget ceiling is the CONNECTED model's window; an unknown window says so (owner bug, D41)", async () => {
    // "The preview just assumes 200k and isn't properly reading from the currently connected model." The
    // ceiling must be whatever THIS chat's resolved connection reports — and when that window is itself a
    // fallback guess (a catalog that couldn't be read), the wire must say `ceilingEstimated` so the panel
    // refuses to draw a ratio against it instead of showing a fabricated denominator.
    const me = await seedUser(db, "ceiling_host");
    const chatId = await seedRoom("ceiling", me);

    // A small-context local model: the ceiling tracks IT, not any blanket default.
    const small = makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 } }, context: { window: 40_960 } });
    const { previewAssembly } = createRead(
      makeChatContext(db),
      makeDeps({ resolveConnection: () => Promise.resolve(makeResolvedConnection({ capability: small })) }),
    );
    const known = await previewAssembly({ principal: principal(me), chatId });
    expect(known.budget.ceilingTokens).toBe(40_960);
    expect(known.budget.ceilingEstimated).toBe(false);

    // The SAME window, but the capability marks it a guess (cold catalog): the number still drives the fit,
    // and the wire flags it so the surface says "unknown".
    const guessed = makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 } }, context: { window: 200_000, windowEstimated: true } });
    const { previewAssembly: previewGuessed } = createRead(
      makeChatContext(db),
      makeDeps({ resolveConnection: () => Promise.resolve(makeResolvedConnection({ capability: guessed })) }),
    );
    const unknown = await previewGuessed({ principal: principal(me), chatId });
    expect(unknown.budget.ceilingTokens).toBe(200_000);
    expect(unknown.budget.ceilingEstimated).toBe(true);
  });

  test("a user's own maxContextTokens cap is TRUTH — it binds, so the ceiling stops being a guess", async () => {
    // The nuance the flag must respect: when the preset's soft cap is below the guessed model window, the cap
    // is what actually bounds the context and the user declared it — the ratio is honest again.
    const me = await seedUser(db, "cap_host");
    const chatId = await seedRoom("cap", me);
    const guessed = makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 } }, context: { window: 200_000, windowEstimated: true } });
    const { previewAssembly } = createRead(
      makeChatContext(db),
      makeDeps({
        resolveConnection: () => Promise.resolve(makeResolvedConnection({ capability: guessed })),
        resolveForeignInputs: () =>
          Promise.resolve({
            promptConfig: { ...DEFAULT_PROMPT_CONFIG, params: { ...DEFAULT_PROMPT_CONFIG.params, maxContextTokens: 16_000 } },
            personas: { anchor: null, active: null },
            globalRegexScripts: [],
            scanDepth: 6,
            injectionTokenBudget: 0,
          }),
      }),
    );

    const preview = await previewAssembly({ principal: principal(me), chatId });

    expect(preview.budget.ceilingTokens).toBe(16_000);
    expect(preview.budget.ceilingEstimated).toBe(false);
  });

  test("a GAME chat previews its state block: the rpg gather rides the preview + gets its own budget row", async () => {
    // Before D-4 the preview omitted the rpg reminder entirely — the host's honesty instrument showed a prompt
    // the model never receives. The gather now runs on the preview path (read-only, turnless) and its depth-0
    // reminder is accounted as `game-state`, disjoint from `steering`.
    const me = await seedUser(db, "game_host");
    const chatId = await seedRoom("game", me);
    const gatherTurnContext = vi.fn(() =>
      Promise.resolve({
        macros: {},
        injections: [{ position: "in_chat" as const, depth: 0, role: "system" as const, content: "## Game state\nroster: Mara (VIT 24/30)" }],
        tools: [],
      }),
    );
    // The same minimal-stub precedent as the deception-replay test below (which fabricates only
    // `resolveReasoningHostOnly`).
    // FABRICATION-OK: minimal ChatRpgOps stub — the preview path calls ONLY `gatherTurnContext`.
    const rpg = { gatherTurnContext } as unknown as NonNullable<ChatContext["rpg"]>;
    const ctx = makeChatContext(db, { rpg });

    const { budget } = await createRead(ctx, makeDeps()).previewAssembly({ principal: principal(me), chatId });

    const gameState = budget.sources.find((s) => s.source === "game-state");
    expect(gameState?.text).toBe("## Game state\nroster: Mara (VIT 24/30)");
    expect(gameState?.detail).toBe("state block");
    expect(gameState?.tokens).toBeGreaterThan(0);
    // Turnless + dice-ineligible: the preview never marks a turn or feeds a queued roll.
    expect(gatherTurnContext).toHaveBeenCalledWith(chatId, undefined, false, expect.objectContaining({ char: expect.any(String) }));
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

    await expect(previewSection({ principal: principal(me), chatId, sectionId: "no-such-section" })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  test("getShapeTrace returns the content-free SHAPE trace for the host; a non-host member is refused (not_host)", async () => {
    const me = await seedUser(db, "me");
    const member = await seedUser(db, "member");
    const chatId = await seedRoom("room", me);
    await seedParticipant(db, { chatId, key: "room_m", userId: member, role: "member" });
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: me, content: "hi" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "hey there" });

    const { getShapeTrace } = createRead(makeChatContext(db), makeDeps());
    const trace = await getShapeTrace({ principal: principal(me), chatId });

    // Row COUNTS per stage, no content bytes — the content-free projection (PD-132).
    expect(trace.stageCounts.withTail).toBe(2);
    expect(typeof trace.squashMerges).toBe("number");
    expect(["placed", "no-stable-prefix", "in-prefix-injection-or-squash", "second-volatile-tail"]).toContain(trace.breakpointDecision);
    // No content leaks: the whole trace serializes to counts/flags/decisions, never the seeded message bodies.
    expect(JSON.stringify(trace)).not.toContain("hey there");

    // A present but non-host member is refused (the host/admin inspector gate, matrix `getShapeTrace: "host"`).
    const err = await getShapeTrace({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
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
    const { messageId } = await seedMessage(db, chatId, 1);

    const read = createRead(makeChatContext(db), makeDeps());
    const p = principal(stranger);
    await expect(read.getChat({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.listMessages({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.listMessageVariants({ principal: p, chatId, messageId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.listParticipants({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.peekPrompt({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(read.streamEventBounds({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    // A non-member of the parent cannot list its forks either.
    await expect(read.listForks({ principal: p, chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
  });
});

describe("read — durable chat-bus log (the streamMessages SSE resume)", () => {
  test("replayChatEvents resumes after a cursor; chatEventBounds reports min/max; both member-gated", async () => {
    const me = await seedUser(db, "me");
    const stranger = await seedUser(db, "stranger");
    const chatId = await seedRoom("room", me);
    // Emit through the REAL domain bus (durable-first) — the replay reads what emit wrote.
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    await bus.emit({ type: "chatUpdated", chatId });
    await bus.emit({ type: "chatDeleted", chatId });
    await bus.emit({ type: "chatUpdated", chatId });

    const { replayChatEvents, chatEventBounds } = createRead(ctx, makeDeps());

    const tail = await replayChatEvents({ principal: principal(me), chatId, afterSeq: 1 });
    expect(tail.map((e) => e.seq)).toEqual([2, 3]);
    expect(tail.map((e) => e.event.type)).toEqual(["chatDeleted", "chatUpdated"]);

    // The attach probe carries the caller's own D16 floor alongside the window (the SSE live loop clamps on
    // it) — `me` is the born-here host, so it is the unclamped 0.
    const bounds = await chatEventBounds({ principal: principal(me), chatId });
    // `reasoningHostOnly` is false — the host reads verbatim, and a plain chat is never deception-active.
    expect(bounds).toEqual({ minSeq: 1, maxSeq: 3, historyFloorSeq: 0, viewerIsHost: true, reasoningHostOnly: false });

    // The membership chokepoint: a stranger's read collapses to a leak-free NOT_FOUND.
    await expect(replayChatEvents({ principal: principal(stranger), chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(chatEventBounds({ principal: principal(stranger), chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
  });

  // The FIRST-TURN-RACE server pin (#1): the client seeds `lastEventId:"0"` for a just-created chat so
  // the server replays the head deltas that raced past the fresh SSE attach. This proves the exact path
  // that silently re-breaks — a fresh chat's DELTA events, written through the REAL durable-first bus,
  // are returned by `replayChatEvents({afterSeq:0})` in seq order with their nested payload intact. The
  // sibling events.int.test only round-trips flat `chatUpdated`/`chatDeleted`; nothing else exercises a
  // real-bus-emitted `delta` (the token-carrying member) through the member-gated replay verb.
  test("a replay from afterSeq 0 returns a fresh chat's head deltas in order, payload intact (the #1 first-turn-race pin)", async () => {
    const me = await seedUser(db, "me");
    const chatId = await seedRoom("room", me);
    // Emit the HEAD of a turn through the REAL domain bus (durable-first: the chat_events INSERT commits
    // before the ring push) — turnStarted + two text deltas, exactly the shape that races the attach.
    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    await bus.emit({
      type: "turnStarted",
      chatId,
      intent: "send",
      api: "chat-completions",
      source: "openrouter",
      model: "test-model",
      speakerCharacterId: null,
      targetMessageId: null,
    });
    // The fresh room's first reply lands at `messages.seq` 1, so that is the slot these tokens fill.
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "Hello " } });
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "world" } });

    const { replayChatEvents } = createRead(ctx, makeDeps());
    // afterSeq:0 == the client's `lastEventId:"0"` seed — replay the whole durable log from baseline.
    const replayed = await replayChatEvents({ principal: principal(me), chatId, afterSeq: 0 });

    expect(replayed.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(replayed.map((e) => e.event.type)).toEqual(["turnStarted", "delta", "delta"]);
    // The token-carrying payload survives the JSON round-trip through the durable column, byte-for-byte —
    // including the `slotSeq` clamp anchor (a lost anchor would silently re-blind every clamped member).
    expect(replayed.slice(1).map((e) => (e.event.type === "delta" ? e.event : null))).toEqual([
      { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "Hello " } },
      { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "world" } },
    ]);
  });
});

describe("previewContextFit — present-tense fit budget (engine-stamp parity)", () => {
  // A real capability with a MID window so the fit trims SOME rows but keeps id-bearing ones (mirrors the
  // pipeline test's boundary anchor). previewFit must reproduce the SAME boundary the engine stamps: the
  // earliest-KEPT id-bearing row. The blown-budget shape (real transcript ending on assistant → id-less
  // continuation nudge appended, window smaller than reserve+system) gets its own test below — the fit's
  // irreducible tail anchors on the newest ID-BEARING turn, so the boundary is nameable even there (the
  // original null-boundary "dodge" here was the bug the live cutoff spec caught, 2026-07-24).
  const midCapability = makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 400 } });

  function makeFitDeps(capability: ModelCapability): Parameters<typeof createRead>[1] {
    return {
      loadParticipantViews,
      resolveConnection: () => Promise.resolve(makeResolvedConnection({ capability })),
      checkSendAvailability: () => Promise.resolve({ available: true }),
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

  test("reproduces the engine's stamped boundary (earliest kept id) + honest budget numbers", async () => {
    const host = await seedUser(db, "fit_host");
    const chatId = await seedRoom("fit", host);
    // 11 alternating id-bearing turns ending on a USER row (odd count) so no continuation nudge is appended.
    // The seq is explicit per row, so insertion order is irrelevant (Promise.all avoids the await-in-loop gate).
    await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        seedMessage(db, chatId, i + 1, {
          role: (i + 1) % 2 === 1 ? "user" : "assistant",
          content: `turn ${i + 1} with several words to spend a few tokens`,
        }),
      ),
    );

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(midCapability));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // The fit trimmed SOME rows (0 < droppedCount < 11 → real rows survive), the boundary is the earliest
    // KEPT message id (message_<chatId>_<seq> for seq = droppedCount + 1 — the seeded 1-indexed scheme), and
    // the budget numbers are honest (not stubbed zeros).
    expect(fit.droppedCount).toBeGreaterThan(0);
    expect(fit.droppedCount).toBeLessThan(11);
    expect(fit.boundaryMessageId).toBe(castId(`message_${chatId}_${fit.droppedCount + 1}`));
    expect(fit.ceilingTokens).toBe(400); // min(window, ∞) — no soft cap set
    expect(fit.reserveOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS); // no preset maxOutputTokens ⇒ the default reserve
    expect(fit.usedTokens).toBeGreaterThan(0);
  });

  // The live-context-cutoff catch (2026-07-24): an EVEN turn count ends the transcript on assistant, so
  // SHAPE appends the id-less continuation nudge as the newest row; a window smaller than reserve+system
  // makes the prompt budget negative. The old newest-ROW irreducible keep retained only the nudge —
  // droppedCount > 0 with boundaryMessageId null, an unrenderable divider. The irreducible TAIL (newest
  // id-bearing turn + trailing synthetics) keeps the newest real row and names it.
  test("a blown budget (tiny window, nudge tail) still names the newest real row as the boundary", async () => {
    const host = await seedUser(db, "fit_host3");
    const chatId = await seedRoom("fit3", host);
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `turn ${i + 1} with several words to spend a few tokens` }),
      ),
    );
    const tiny = makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 200 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(tiny));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // Everything older than the newest real row drops (5 canon rows; the nudge rides irreducibly and is
    // uncounted as a drop), and the boundary NAMES the survivor — the newest seeded row.
    expect(fit.droppedCount).toBe(5);
    expect(fit.boundaryMessageId).toBe(castId(`message_${chatId}_6`));
    expect(fit.ceilingTokens).toBe(200);
  });

  test("everything fits under a wide window ⇒ null boundary, zero dropped", async () => {
    const host = await seedUser(db, "fit_host2");
    const chatId = await seedRoom("fit2", host);
    await Promise.all(
      Array.from({ length: 4 }, (_, i) => seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `short turn ${i + 1}` })),
    );
    const wide = makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 1_000_000 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(wide));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    expect(fit.droppedCount).toBe(0);
    expect(fit.boundaryMessageId).toBeNull();
    expect(fit.ceilingTokens).toBe(1_000_000);
  });

  // COMPACTION-COVERED shrinkage (#9 verifier fix): a chat with a marker covering through seq N excludes seq
  // ≤ N from the shaped history, so previewFit's boundary is TRUE (> N) on BOTH the wide-window (no fit trim)
  // and the tiny-window (fit trims further) paths, and the memory fact is exposed.
  const stampMarker = (chatId: Awaited<ReturnType<typeof seedRoom>>, coveredThroughSeq: number): Promise<unknown> =>
    db.update(chatsTable).set({ compactSummary: "the story so far", compactedAtSeq: coveredThroughSeq }).where(eq(chatsTable.id, chatId));

  test("a marker covering seq 2 ⇒ wide window keeps NOTHING dropped but the boundary is the first row above coverage (seq 3) + summary exposed", async () => {
    const host = await seedUser(db, "fit_cov");
    const chatId = await seedRoom("fitcov", host);
    await Promise.all(
      Array.from({ length: 4 }, (_, i) => seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `short turn ${i + 1}` })),
    );
    await stampMarker(chatId, 2);
    const wide = makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 1_000_000 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(wide));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // Covered rows (seq 1-2) fell out of the shaped history, so the fit dropped nothing MORE; the boundary is
    // the first row STILL in the prompt above the coverage point (seq 3), and the marker is exposed.
    expect(fit.droppedCount).toBe(0);
    expect(fit.boundaryMessageId).toBe(castId(`message_${chatId}_3`));
    expect(fit.compactSummary).toBe("the story so far");
  });

  test("a marker covering seq 2 + a tiny window ⇒ the fit trims the post-marker window FURTHER; boundary > coverage, summary still exposed", async () => {
    const host = await seedUser(db, "fit_cov2");
    const chatId = await seedRoom("fitcov2", host);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `turn ${i + 1} with several words to spend a few tokens` }),
      ),
    );
    await stampMarker(chatId, 2);
    const tiny = makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 260 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(tiny));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    // The shaped input already excludes seq 1-2; the tiny window then trims some of the post-marker rows. The
    // boundary NAMES a survivor with seq > 2 (never a covered row), and the marker covers everything above it.
    expect(fit.boundaryMessageId).not.toBeNull();
    const boundarySeq = Number((fit.boundaryMessageId ?? "").toString().split("_").at(-1));
    expect(boundarySeq).toBeGreaterThan(2);
    expect(fit.compactSummary).toBe("the story so far");
  });

  test("no marker ⇒ compactSummary is null even with dropped rows (a plain fit boundary, no memory fact)", async () => {
    const host = await seedUser(db, "fit_nocov");
    const chatId = await seedRoom("fitnocov", host);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        seedMessage(db, chatId, i + 1, { role: (i + 1) % 2 === 1 ? "user" : "assistant", content: `turn ${i + 1} with several words to spend a few tokens` }),
      ),
    );
    const tiny = makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 260 } });

    const { previewContextFit } = createRead(makeChatContext(db), makeFitDeps(tiny));
    const fit = await previewContextFit({ principal: principal(host), chatId });

    expect(fit.droppedCount).toBeGreaterThan(0);
    expect(fit.compactSummary).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// The §3.6 hidden-content MEMBER-STRIP (parity-plus) — a TRUST BOUNDARY, pinned at the PAYLOAD level: the
// instrument is the server-side strip at the read/replay projections; the CONSEQUENCE asserted is that a
// member's serialized payload contains ZERO truth bytes (a client-only hide leaks in the wire). The model's
// wire is untouched (pipeline pins own {wire: full}); the host reads unstripped (the P3 reveal eye's plane).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("read — the §3.6 hidden-content member-strip", () => {
  const lieTag = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';

  test("listMessages: a MEMBER's payload carries ZERO hidden bytes; the HOST reads the full stored body", async () => {
    const host = await seedUser(db, "ms_host");
    const member = await seedUser(db, "ms_member");
    const chatId = await seedRoom("ms", host);
    await seedParticipant(db, { chatId, key: "ms_m", userId: member, role: "member" });
    await seedMessage(db, chatId, 1, { role: "assistant", content: `He nods. ${lieTag} "Nothing," he says.` });

    const { listMessages } = createRead(makeChatContext(db), makeDeps());

    const memberPage = await listMessages({ principal: principal(member), chatId });
    const memberPayload = JSON.stringify(memberPage);
    expect(memberPayload).not.toContain("crypt");
    expect(memberPayload).not.toContain("<lie");
    expect(memberPage.messages[0]?.content).toBe('He nods.  "Nothing," he says.');

    const hostPage = await listMessages({ principal: principal(host), chatId });
    expect(hostPage.messages[0]?.content).toBe(`He nods. ${lieTag} "Nothing," he says.`);
  });

  test("replayChatEvents: a replayed view payload is stripped for a MEMBER, full for the HOST; chatEventBounds resolves viewerIsHost", async () => {
    const host = await seedUser(db, "mr_host");
    const member = await seedUser(db, "mr_member");
    const chatId = await seedRoom("mr", host);
    await seedParticipant(db, { chatId, key: "mr_m", userId: member, role: "member" });
    const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", content: `prose ${lieTag}` });

    const ctx = makeChatContext(db);
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const view = await loadMessageView(db, messageId);
    await bus.emit({ type: "messageCommitted", chatId, messageId, ...(view === undefined ? {} : { view }) });

    const { replayChatEvents, chatEventBounds } = createRead(ctx, makeDeps());

    const memberReplay = await replayChatEvents({ principal: principal(member), chatId, afterSeq: 0 });
    expect(memberReplay).toHaveLength(1);
    expect(JSON.stringify(memberReplay)).not.toContain("crypt");
    expect(JSON.stringify(memberReplay)).not.toContain("<lie");

    const hostReplay = await replayChatEvents({ principal: principal(host), chatId, afterSeq: 0 });
    expect(JSON.stringify(hostReplay)).toContain("crypt");

    // The LIVE half's verdict input: the same member-gated probe hands the transport `viewerIsHost`.
    expect((await chatEventBounds({ principal: principal(host), chatId })).viewerIsHost).toBe(true);
    expect((await chatEventBounds({ principal: principal(member), chatId })).viewerIsHost).toBe(false);
  });

  // The DURABLE-replay DELTA leak (found by the e2e reasoning-strip proof): a resume from afterSeq:0 re-drains
  // the raw mid-turn `delta` rows, so `replayChatEvents` must scrub them per-slot exactly like the LIVE
  // transport — otherwise a member's reconnect leaks the model's hidden `<lie>` TEXT bytes AND, on a
  // deception-active game, the whole reasoning channel the live stream withheld. Deception-active is injected
  // via the `rpg.resolveReasoningHostOnly` op (the ONE seam chat reads the verdict from).
  test("replayChatEvents (deception game): a MEMBER's durable resume withholds reasoning DELTAS + scrubs hidden TEXT deltas; the HOST gets both", async () => {
    const host = await seedUser(db, "drd_host");
    const member = await seedUser(db, "drd_member");
    const chatId = await seedRoom("drd", host);
    await seedParticipant(db, { chatId, key: "drd_m", userId: member, role: "member" });
    // A committed reply slot at seq 1 (the deltas below stream INTO it — slotSeq 1).
    const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", content: `He nods. ${lieTag}` });

    // Deception-active: the injected op returns true for this chat (the game's `deception||omniscience`). A
    // minimal ChatRpgOps stub — read.ts calls ONLY `resolveReasoningHostOnly` on the non-host replay path.
    // FABRICATION-OK: minimal ChatRpgOps stub — only `resolveReasoningHostOnly` is reached by these reads.
    const deceptionRpg = { resolveReasoningHostOnly: () => Promise.resolve(true) } as unknown as NonNullable<ChatContext["rpg"]>;
    const ctx = makeChatContext(db, { rpg: deceptionRpg });
    const bus = createChatBus({ db, now: ctx.now, newEventId: ctx.newEventId });
    const view = await loadMessageView(db, messageId);
    // The exact durable log a member's reconnect re-drains: a reasoning delta (spells the truth), the hidden
    // `<lie>` TEXT delta, the reasoningStreamDone signal, then the at-commit committed view.
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "reasoning", text: "I'll deflect, but he is in the crypt." } });
    await bus.emit({ type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: `He nods. ${lieTag}` } });
    await bus.emit({ type: "reasoningStreamDone", chatId });
    await bus.emit({ type: "messageCommitted", chatId, messageId, ...(view === undefined ? {} : { view }) });

    const { replayChatEvents } = createRead(ctx, makeDeps());

    const memberReplay = await replayChatEvents({ principal: principal(member), chatId, afterSeq: 0 });
    const memberBytes = JSON.stringify(memberReplay);
    // Zero truth bytes anywhere — reasoning delta withheld, text delta scrubbed, committed view stripped.
    expect(memberBytes).not.toContain("crypt");
    expect(memberBytes).not.toContain("<lie");
    // No reasoning-channel delta and no `reasoningStreamDone` reach the member on a deception game.
    expect(memberReplay.some((e) => e.event.type === "delta" && e.event.delta.kind === "reasoning")).toBe(false);
    expect(memberReplay.some((e) => e.event.type === "reasoningStreamDone")).toBe(false);

    // The host gets the whole log verbatim — the reasoning delta + the raw `<lie>` + reasoningStreamDone.
    const hostReplay = await replayChatEvents({ principal: principal(host), chatId, afterSeq: 0 });
    const hostBytes = JSON.stringify(hostReplay);
    expect(hostBytes).toContain("crypt");
    expect(hostReplay.some((e) => e.event.type === "delta" && e.event.delta.kind === "reasoning")).toBe(true);
    expect(hostReplay.some((e) => e.event.type === "reasoningStreamDone")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D22 `getMemberCard` — the per-member VISIBILITY read. A present member may READ a roster character's card,
// but ONLY the fields at/below the room's host-set `memberCardVisibility`. The RISK this proves closed: a
// card's prompt-steering internals (systemPrompt/postHistory) or its lore leaking to a member below the level,
// and a non-participant (or a not-in-roster characterId) reading any card. Every assertion below checks the
// WIRE payload (fields ABSENT/null), not a client-side hide — the strip is server-side by construction.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("read — getMemberCard (D22 member-card visibility)", () => {
  const cardChar = castId<CharacterId>("character_mc_card");

  /** A card whose text fields carry `{{user}}`/`{{char}}` macros — so a passing render proves the anchor +
   *  character bind (never literal braces on the wire), and the field values double as visibility sentinels. */
  const macroCard: CharacterCard = {
    name: "Seraphine",
    description: "{{char}} greets {{user}} warmly",
    personality: "curious",
    scenario: "{{user}} meets {{char}}",
    greetings: [{ text: "Hi {{user}}, I am {{char}}" }],
    exampleMessages: "{{char}}: hello {{user}}",
    systemPrompt: "SECRET: {{char}} manipulates {{user}}",
    postHistoryInstructions: "SECRET-JB: stay in character as {{char}}",
    depthPrompt: { depth: 4, prompt: "note" },
    creatorNotes: "made by alex",
    creator: "alex",
    cardVersion: "1.0",
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };

  const anchorPersona: AssemblePersona = { name: "Alex", description: "the anchor persona" };

  /** A ChatContext wired for the member-card read: the card via `getCard` (keyed to `cardChar`), the tags via
   *  `resolveCharacterTags`, the avatar hash via `resolveAssetHash`. Everything else is the harness default.
   *  `card` overrides the served card (the clamp-bypass tests inject a card with a full-only macro in a
   *  surviving sheet-tier field). */
  function makeCardCtx(overrides: { tags?: string[]; avatarHash?: string | null; card?: CharacterCard } = {}): ChatContext {
    const served = overrides.card ?? macroCard;
    return makeChatContext(db, {
      getCard: ({ characterId }) => Promise.resolve(characterId === cardChar ? served : null),
      resolveCharacterTags: () => Promise.resolve(overrides.tags ?? ["fantasy", "rogue"]),
      resolveAssetHash: () => Promise.resolve(overrides.avatarHash ?? null),
    });
  }

  /** The anchor-persona render deps: `resolveForeignInputs` returns the anchorPersona as `personas.anchor` — the same
   *  DTO the composition root produces, so the display render binds `{{user}}` to it exactly as the assemble does. */
  function makeCardDeps(): Parameters<typeof createRead>[1] {
    return {
      loadParticipantViews,
      // getMemberCard never resolves a connection (a card DISPLAY is not a turn) — a real factory keeps the
      // dep type-honest without the double-cast the `no-test-fabrication` gate forbids.
      resolveConnection: () => Promise.resolve(makeResolvedConnection()),
      checkSendAvailability: () => Promise.resolve({ available: true }),
      resolveForeignInputs: () =>
        Promise.resolve({
          promptConfig: DEFAULT_PROMPT_CONFIG,
          personas: { anchor: anchorPersona, active: anchorPersona },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
        }),
    };
  }

  /** Seed a room whose group config sets `memberCardVisibility`, with a host + the card character seated +
   *  a plain member. Returns the ids. The card char's WI (`loadCharacterCardLore` source) is seeded separately. */
  async function seedCardRoom(key: string, visibility: MemberCardVisibility): Promise<{ host: UserId; member: UserId; chatId: ChatId }> {
    const host = await seedUser(db, `${key}_host`);
    const member = await seedUser(db, `${key}_member`);
    const chatId = await seedChat(db, key, { metadata: { group: { output: "per-speaker", policy: "natural", memberCardVisibility: visibility } } });
    await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: `${key}_m`, userId: member, role: "member" });
    await seedCharacter(db, host, "mc_card", { id: cardChar });
    await seedParticipant(db, { chatId, key: `${key}_c`, characterId: cardChar });
    return { host, member, chatId };
  }

  /** Seed a character-scope world-info book (owned by `owner`) + one enabled entry, linked to `characterId`. */
  async function seedCardLore(owner: UserId, key: string, content: string): Promise<void> {
    const bookId = castId<WorldBookId>(`world_book_${key}`);
    await db.insert(worldBooks).values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT });
    await db.insert(worldEntries).values({
      id: castId<WorldEntryId>(`world_entry_${key}`),
      worldBookId: bookId,
      title: key,
      content,
      keys: null,
      enabled: true,
      priority: 0,
      ignoreBudget: false,
      metadata: null,
      createdAt: FROZEN_AT,
    });
    await db.insert(characterBooks).values({ characterId: cardChar, worldBookId: bookId, role: "auxiliary", createdAt: FROZEN_AT });
  }

  test("a MEMBER at `sheet` sees name/description/personality/scenario but NOT systemPrompt/postHistory/lore (wire payload)", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_sheet", "sheet");
    // The card HAS lore, but a `sheet` member is below `sheet+lore` — it must be clamped null regardless.
    await seedCardLore(host, "mc_sheet_lore", "hidden lore");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    // sheet-tier fields present…
    expect(view.name).toBe("Seraphine");
    expect(view.description).not.toBeNull();
    expect(view.personality).toBe("curious");
    expect(view.scenario).not.toBeNull();
    // …the prompt-steering internals + lore are NULL, and the SECRET bytes never cross the wire.
    expect(view.systemPrompt).toBeNull();
    expect(view.postHistoryInstructions).toBeNull();
    expect(view.lore).toBeNull();
    const bytes = JSON.stringify(view);
    expect(bytes).not.toContain("SECRET");
    expect(bytes).not.toContain("hidden lore");
  });

  test("at `sheet+lore` the character's rendered lore appears; the prompt internals stay NULL", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_lore", "sheet+lore");
    // The lore book is the HOST's (the card owner) — the read is host-owner-scoped.
    await seedCardLore(host, "mc_lore_entry", "the ancient prophecy");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    expect(view.lore).toEqual(["the ancient prophecy"]);
    expect(view.systemPrompt).toBeNull();
    expect(view.postHistoryInstructions).toBeNull();
  });

  test("the HOST always sees `full` — systemPrompt/postHistory/lore all present even when the room is set to `sheet`", async () => {
    const { host, chatId } = await seedCardRoom("mc_host", "sheet");
    await seedCardLore(host, "mc_host_lore", "host-visible lore");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    const view = await getMemberCard({ principal: principal(host), chatId, characterId: cardChar });

    expect(view.visibility).toBe("full");
    expect(view.systemPrompt).not.toBeNull();
    expect(view.postHistoryInstructions).not.toBeNull();
    expect(view.lore).toEqual(["host-visible lore"]);
  });

  test("surviving text fields RENDER display macros against the anchorPersona persona — no literal braces on the wire", async () => {
    const { host, chatId } = await seedCardRoom("mc_macro", "full");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    // Host = full, so every field survives and every field renders.
    const view = await getMemberCard({ principal: principal(host), chatId, characterId: cardChar });

    // `{{user}}` → anchor name (Alex), `{{char}}` → the card name (Seraphine); never literal braces.
    expect(view.scenario).toBe("Alex meets Seraphine");
    expect(view.description).toBe("Seraphine greets Alex warmly");
    expect(view.greetings).toEqual(["Hi Alex, I am Seraphine"]);
    expect(view.systemPrompt).toBe("SECRET: Seraphine manipulates Alex");
    expect(JSON.stringify(view)).not.toContain("{{");
  });

  test("a NON-PARTICIPANT gets a leak-free NOT_FOUND (no card bytes)", async () => {
    const { chatId } = await seedCardRoom("mc_stranger", "full");
    const stranger = await seedUser(db, "mc_the_stranger");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    const err = await getMemberCard({ principal: principal(stranger), chatId, characterId: cardChar }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
    // The refusal carries no card content — it names the chat, not the character.
    expect(JSON.stringify((err as ChatNotFoundError).message)).not.toContain("Seraphine");
  });

  test("a characterId NOT in THIS chat's roster is NOT_FOUND (you cannot read an arbitrary card through your chat)", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_foreign", "full");
    // A character the host owns but that is NOT seated in this chat.
    const foreignChar = await seedCharacter(db, host, "mc_foreign_char");

    const { getMemberCard } = createRead(makeCardCtx(), makeCardDeps());
    // Even the host cannot read a not-in-roster card through this chat.
    await expect(getMemberCard({ principal: principal(host), chatId, characterId: foreignChar })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(getMemberCard({ principal: principal(member), chatId, characterId: foreignChar })).rejects.toBeInstanceOf(ChatNotFoundError);
  });

  test("at `name-avatar` even the sheet identity is withheld — only name/avatarHash/tags-null survive", async () => {
    const { member, chatId } = await seedCardRoom("mc_floor", "name-avatar");

    const { getMemberCard } = createRead(makeCardCtx({ avatarHash: "hash_seraphine" }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    expect(view.name).toBe("Seraphine");
    expect(view.avatarHash).toBe("hash_seraphine");
    expect(view.description).toBeNull();
    expect(view.personality).toBeNull();
    expect(view.tags).toBeNull();
    expect(view.systemPrompt).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────────────
  // THE CLAMP-BYPASS REGRESSION (security review 2026-07-28 — CONFIRMED HIGH, was untested). The bug: the
  // display-render context was built from the FULL card, so a SURVIVING sheet-tier field embedding a full-only
  // card macro (`{{charsysinfo}}` ← systemPrompt, `{{charposthistory}}` ← postHistoryInstructions) re-expanded
  // the exact bytes the clamp nulled. Exploitable via imported/shared cards (author ≠ room host). The fix binds
  // the render context from the CLAMPED view, so the macro renders EMPTY for a below-`full` member.
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** A malicious/imported card: its SURVIVING sheet-tier fields embed full-only macros. If the render context
   *  is the full card, a `sheet` member's `description`/`scenario` leak the systemPrompt/post-history bytes. */
  const bypassCard: CharacterCard = {
    ...macroCard,
    description: "A rogue. LEAK[{{charsysinfo}}]",
    personality: "sly LEAK[{{charposthistory}}]",
    scenario: "a tavern; {{charsysinfo}}",
    greetings: [{ text: "hi — {{charposthistory}}" }],
    exampleMessages: "ex: {{charsysinfo}}",
    creatorNotes: "notes: {{charsysinfo}}",
    systemPrompt: "TOP_SECRET_SYSTEM_PROMPT",
    postHistoryInstructions: "TOP_SECRET_JAILBREAK",
  };

  test("a `sheet` member CANNOT surface systemPrompt/post-history via a {{charsysinfo}}/{{charposthistory}} macro in a surviving field (the clamp-bypass fix)", async () => {
    const { member, chatId } = await seedCardRoom("mc_bypass", "sheet");

    const { getMemberCard } = createRead(makeCardCtx({ card: bypassCard }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    // The full-only fields are NULL…
    expect(view.systemPrompt).toBeNull();
    expect(view.postHistoryInstructions).toBeNull();
    // …AND the macros that reference them render EMPTY inside the surviving fields (not the secret bytes).
    // The macro expands to "" in place (no mid-string trim), so the surrounding literal text is unchanged
    // minus the secret. The load-bearing assertion is the ABSENCE of the secret bytes (checked below).
    expect(view.description).toBe("A rogue. LEAK[]");
    expect(view.personality).toBe("sly LEAK[]");
    expect(view.scenario).toBe("a tavern; ");
    expect(view.greetings).toEqual(["hi — "]);
    expect(view.exampleMessages).toBe("ex: ");
    expect(view.creatorNotes).toBe("notes: ");
    // THE WIRE PROOF: the serialized view is byte-clean of the secret content, anywhere.
    const bytes = JSON.stringify(view);
    expect(bytes).not.toContain("TOP_SECRET_SYSTEM_PROMPT");
    expect(bytes).not.toContain("TOP_SECRET_JAILBREAK");
  });

  test("`name-avatar` (below sheet) also can't leak — the surviving-field surface is empty, and no macro re-adds a secret", async () => {
    const { member, chatId } = await seedCardRoom("mc_bypass_floor", "name-avatar");

    const { getMemberCard } = createRead(makeCardCtx({ card: bypassCard }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    // Below `sheet`, description/scenario/etc. are themselves clamped null — nothing to render, nothing to leak.
    expect(view.description).toBeNull();
    expect(view.scenario).toBeNull();
    expect(view.systemPrompt).toBeNull();
    expect(JSON.stringify(view)).not.toContain("TOP_SECRET");
  });

  test("`sheet+lore` member: lore appears, but the {{charsysinfo}} macro in a surviving field STILL renders empty (full-only stays clamped)", async () => {
    const { host, member, chatId } = await seedCardRoom("mc_bypass_lore", "sheet+lore");
    await seedCardLore(host, "mc_bypass_lore_entry", "the prophecy");

    const { getMemberCard } = createRead(makeCardCtx({ card: bypassCard }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(member), chatId, characterId: cardChar });

    expect(view.lore).toEqual(["the prophecy"]);
    expect(view.systemPrompt).toBeNull();
    expect(view.description).toBe("A rogue. LEAK[]");
    expect(JSON.stringify(view)).not.toContain("TOP_SECRET");
  });

  test("the HOST (full) DOES see the {{charsysinfo}} macro expand — the render obeys the level, it doesn't blanket-strip", async () => {
    const { host, chatId } = await seedCardRoom("mc_bypass_host", "full");

    const { getMemberCard } = createRead(makeCardCtx({ card: bypassCard }), makeCardDeps());
    const view = await getMemberCard({ principal: principal(host), chatId, characterId: cardChar });

    // At `full`, systemPrompt survives, so `{{charsysinfo}}` in the description resolves to it (render-on-display
    // for the fields the viewer IS allowed to see — the fix clamps the render context to the LEVEL, not to empty).
    expect(view.systemPrompt).toBe("TOP_SECRET_SYSTEM_PROMPT");
    expect(view.description).toBe("A rogue. LEAK[TOP_SECRET_SYSTEM_PROMPT]");
    expect(view.personality).toBe("sly LEAK[TOP_SECRET_JAILBREAK]");
  });
});
