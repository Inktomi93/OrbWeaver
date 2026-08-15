// `startChat` (chat.md Part I `verbs/start-chat.ts`) — proves against a real libSQL db: the room is minted with
// the caller as `host` + the founding characters as members (D28 live-identity roster — `chat_participants`
// references the live `characters` row), the opening seeds per the resolved `OpeningPolicy` (first-message =
// the primary's greeting VERBATIM; greet-all = every founding character; none = nothing), and `chatCreated`
// (+ a `messageCommitted` per seeded greeting) fires. Reached through the BUNDLE `createStartChat(ctx, deps)`.
//
// R2 (chat-creation-draft-mode-replacement.md §4.4) retired the creation-time draft carry
// (seedGreetings/rosterOverrides/groupConfig/roomOverrides/guided + the `generate` opening arm and its
// `openingFailure` degrade) — `StartChatParams` carries CREATION-INTENT inputs only now, and this suite's
// coverage retired with it. Group config/roster tuning/greeting edits are proved against the real room by
// their own post-create verbs (`setGroupConfig`/`setSeatKnobs`/`editMessage`/`setSeededGreeting`).

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chatInjections, chatParticipants, chats, messages, personas } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { listMemberChats } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createStartChat } from "../../../../../packages/server/src/domain/chat/verbs/start-chat.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, makeLoadParticipantViews, seedCharacter, seedUser } from "../_support.ts";

/** A page bound comfortably above every fixture here — these arms are about the FILTERS, not the keyset. */
const TEST_PAGE_LIMIT = 100;

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

/** A full canonical card with a single greeting (D28 live read; the rest is empty). */
function cardWith(name: string, greeting: string): CharacterCard {
  return {
    name,
    description: null,
    personality: null,
    scenario: null,
    greetings: greeting.length > 0 ? [{ text: greeting }] : [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
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
}

function makeDeps(): Parameters<typeof createStartChat>[1] {
  return { emit, loadParticipantViews };
}

describe("startChat — #40 draft-time game birth (startAsGame)", () => {
  test("a startAsGame carry calls the injected rpg.startGame for the minted chat, threading the profile blind", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const started: { chatId: ChatId; profile: unknown }[] = [];
    // FABRICATION-OK: minimal ChatRpgOps stub — startChat reaches ONLY `startGame` on this path.
    const rpg = {
      startGame: (chatId: ChatId, params: { profile?: unknown }): Promise<void> => {
        started.push({ chatId, profile: params.profile });
        return Promise.resolve();
      },
    } as unknown as NonNullable<NonNullable<Parameters<typeof makeChatContext>[1]>["rpg"]>;
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardWith("Aria", "Hello.")), rpg });
    const { startChat } = createStartChat(ctx, makeDeps());
    const result = await startChat({ principal: principal(host), characterIds: [aria], startAsGame: {} });
    // The op fired exactly once for the minted chat (BEFORE the verb returned — turn 1 is in-game); an
    // omitted profile rides through as undefined (freeform default is rpg's own).
    expect(started).toEqual([{ chatId: result.chat.id, profile: undefined }]);
  });

  test("no startAsGame carry ⇒ the rpg op never fires (byte-identical plain creation)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const started: string[] = [];
    // FABRICATION-OK: minimal ChatRpgOps stub — asserting the ABSENCE of the call.
    const rpg = {
      startGame: (chatId: ChatId): Promise<void> => {
        started.push(chatId);
        return Promise.resolve();
      },
    } as unknown as NonNullable<NonNullable<Parameters<typeof makeChatContext>[1]>["rpg"]>;
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardWith("Aria", "Hello.")), rpg });
    const { startChat } = createStartChat(ctx, makeDeps());
    await startChat({ principal: principal(host), characterIds: [aria] });
    expect(started).toEqual([]);
  });
});

// R0 §4.7 MOVED THE CREATION STATS TO THE CLAIM. Creation itself is now delta-SILENT: a husk nobody
// started must not inflate chat-created economics, and the firstness probe must not let a husk consume
// a character's one `newCharacter` bump. These two arms therefore assert the SILENCE, which is this
// verb's whole remaining stats contract; the counters themselves (chat-created, the per-character first
// bumps, the seeded greetings' contribution) are proved end-to-end over creation→claim in
// `husk-lifecycle.suite.int.test.ts` — one home for the timing, one for the arithmetic.
describe("startChat — canon-mutator stats push (stats.md)", () => {
  test("creation pushes NOTHING — the chat-created counters and the greeting contribution wait for the claim", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "Hello there friend.")),
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    expect(deltas).toStrictEqual([]);
    // …and the room really was created with its greeting — the silence is a TIMING change, not a
    // creation that failed.
    expect(await db.select().from(messages).where(eq(messages.chatId, chat.id))).toHaveLength(1);
  });

  test("PD-96 firstness is DEFERRED too: two creations in a row push nothing, so no husk can spend a character's first-chat bump", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const bryn = await seedCharacter(db, host, "bryn");
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "")),
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });
    const { startChat } = createStartChat(ctx, makeDeps());

    // Two husks back to back. Under the OLD timing the first would have spent aria's `newCharacter`
    // bump at creation — and if it were then abandoned and reaped, that bump was gone forever. Now
    // neither creation counts anything, and whichever room is CLAIMED first is the one that gets it.
    await startChat({ principal: principal(host), characterIds: [aria], opening: "none" });
    await startChat({ principal: principal(host), characterIds: [aria, bryn], opening: "none" });

    expect(deltas).toStrictEqual([]);
  });
});

describe("startChat — lazy room creation + opening", () => {
  test("first-message (solo): seeds the primary greeting VERBATIM; caller is host; D28 live roster", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "Hello, I am {{char}}.")),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat, opening } = await startChat({
      principal: principal(host),
      characterIds: [aria],
    });

    // The caller is the host; the character is a member referencing the LIVE row (D28 — not a copied card).
    const hostRow = chat.participants.find((p) => p.role === "host");
    expect(hostRow?.userId).toBe(host);
    const charRow = chat.participants.find((p) => p.kind === "character");
    expect(charRow?.characterId).toBe(aria);
    expect(charRow?.role).toBe("member");

    // The greeting is seeded VERBATIM (the `{{char}}` macro is NOT resolved at seed — FLAG[greeting-macro]).
    expect(opening?.aborted).toBe(false);
    expect(opening?.messages).toHaveLength(1);
    expect(opening?.messages[0]?.content).toBe("Hello, I am {{char}}.");
    expect(opening?.messages[0]?.role).toBe("assistant");
    expect(opening?.messages[0]?.characterId).toBe(aria);
    expect(opening?.messages[0]?.seq).toBe(1);

    // `chatCreated` then a `messageCommitted` for the seeded greeting.
    expect(emitted[0]).toEqual({ type: "chatCreated", chatId: chat.id });
    expect(emitted[1]?.type).toBe("messageCommitted");

    // The opening is real canon in the new chat (no `ownerId`; an explicit opening was NOT set → metadata null).
    const rows = await db.select().from(messages).where(eq(messages.chatId, chat.id));
    expect(rows).toHaveLength(1);
    expect(chat.opening).toBeNull();
  });

  test("greet-all (group default): every founding character greets, in roster order (seq 1..N)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const borg = await seedCharacter(db, host, "borg");
    const ctx = makeChatContext(db, {
      getCard: ({ characterId }) => Promise.resolve(characterId === aria ? cardWith("Aria", "Aria hi") : cardWith("Borg", "Borg hi")),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { opening } = await startChat({ principal: principal(host), characterIds: [aria, borg] });

    expect(opening?.messages.map((m) => m.content)).toEqual(["Aria hi", "Borg hi"]);
    expect(opening?.messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(opening?.messages.map((m) => m.characterId)).toEqual([aria, borg]);
  });

  test("greet-all: a character with no greeting is skipped (never an empty seeded row)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const mute = await seedCharacter(db, host, "mute");
    const ctx = makeChatContext(db, {
      getCard: ({ characterId }) => Promise.resolve(characterId === aria ? cardWith("Aria", "Aria hi") : cardWith("Mute", "")),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat, opening } = await startChat({
      principal: principal(host),
      characterIds: [aria, mute],
    });

    expect(opening?.messages.map((m) => m.content)).toEqual(["Aria hi"]);
    const rows = await db.select().from(messages).where(eq(messages.chatId, chat.id));
    expect(rows).toHaveLength(1);
  });

  test("none: seeds nothing; opening is null; only chatCreated fires; metadata records the policy", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    // getCard IS reached on every path now (the PD-21 founding-cast ownership validation) — but the `none`
    // policy still seeds nothing from it.
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardWith("Aria", "hi")) });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat, opening } = await startChat({
      principal: principal(host),
      characterIds: [aria],
      opening: "none",
    });

    expect(opening).toBeNull();
    expect(chat.opening).toBe("none");
    expect(emitted).toEqual([{ type: "chatCreated", chatId: chat.id }]);
    const rows = await db.select().from(messages).where(eq(messages.chatId, chat.id));
    expect(rows).toHaveLength(0);
  });

  test("atomic: the chat row + the full roster commit together", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardWith("Aria", "hi")) });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const roster = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chat.id)).orderBy(asc(chatParticipants.joinSeq));
    expect(roster).toHaveLength(2);
    expect(roster.filter((r) => r.role === "host")).toHaveLength(1);
    expect(roster.every((r) => r.joinSeq === 0)).toBe(true);
  });

  test("a foreign/unknown founding character is refused NOT_FOUND — no ghost roster row (PD-21)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    // The owner-scoped card read: a foreign character resolves null (foreign == missing, leak-free).
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(null) });
    const { startChat } = createStartChat(ctx, makeDeps());

    await expect(
      startChat({
        principal: principal(host),
        characterIds: [castId<CharacterId>("character_foreign")],
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(await db.select().from(chats)).toHaveLength(0);
    expect(await db.select().from(chatParticipants)).toHaveLength(0);
  });

  test("temporary: the flag lands on the row (ST Temporary Chat, PD-65); absent ⇒ persistent", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardWith("Aria", "hi")) });
    const { startChat } = createStartChat(ctx, makeDeps());

    const temp = await startChat({
      principal: principal(host),
      characterIds: [aria],
      temporary: true,
    });
    const persistent = await startChat({ principal: principal(host), characterIds: [aria] });

    const [tempRow] = await db.select().from(chats).where(eq(chats.id, temp.chat.id));
    const [persistentRow] = await db.select().from(chats).where(eq(chats.id, persistent.chat.id));
    expect(tempRow?.temporary).toBe(true);
    expect(persistentRow?.temporary).toBe(false);
  });
});

describe("startChat — anchor default-seed (the starter's active persona)", () => {
  /** Insert a personas row (the chats.anchorPersonaId FK target). */
  async function seedPersona(ownerId: UserId, id: string): Promise<PersonaId> {
    const personaId = castId<PersonaId>(id);
    await db.insert(personas).values({ id: personaId, ownerId, name: id, description: "d" });
    return personaId;
  }

  test("no explicit anchor: the starter's user-level active persona seeds anchor + host activePersonaId", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const mine = await seedPersona(host, "persona_mine");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveDefaultPersona: (userId) => Promise.resolve(userId === host ? mine : null),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(mine);
    const hostRow = chat.participants.find((p) => p.role === "host");
    expect(hostRow?.activePersonaId).toBe(mine);
  });

  test("an explicit anchor always wins over the default seed", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const explicit = await seedPersona(host, "persona_explicit");
    const fallback = await seedPersona(host, "persona_fallback");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveDefaultPersona: () => Promise.resolve(fallback),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({
      principal: principal(host),
      characterIds: [aria],
      anchorPersonaId: explicit,
    });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(explicit);
  });

  test("no explicit anchor + no user-level persona: the anchor stays unset (null, never a broken FK)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBeNull();
  });

  test("the connected persona (character-lock hop, D62) beats the default seed", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const connected = await seedPersona(host, "persona_connected");
    const fallback = await seedPersona(host, "persona_fallback");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveConnectedPersona: (userId, characterIds) => Promise.resolve(userId === host && characterIds[0] === aria ? connected : null),
      resolveDefaultPersona: () => Promise.resolve(fallback),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(connected);
    const hostRow = chat.participants.find((p) => p.role === "host");
    expect(hostRow?.activePersonaId).toBe(connected);
  });

  test("no connection (the hop yields null): the default seed still anchors", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const fallback = await seedPersona(host, "persona_fallback");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveConnectedPersona: () => Promise.resolve(null),
      resolveDefaultPersona: () => Promise.resolve(fallback),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(fallback);
  });

  test("an explicit anchor beats the connected persona too (full precedence: explicit > connected > default)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const explicit = await seedPersona(host, "persona_explicit");
    const connected = await seedPersona(host, "persona_connected");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveConnectedPersona: () => Promise.resolve(connected),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({
      principal: principal(host),
      characterIds: [aria],
      anchorPersonaId: explicit,
    });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(explicit);
  });

  // Pointer #2 (FINAL-Persona §A.3): the seed chain is `explicit ?? connected ?? current ?? default`.
  test("the Current persona (#2) beats the Default seed (#1) when no explicit/connected anchor", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const current = await seedPersona(host, "persona_current");
    const fallback = await seedPersona(host, "persona_fallback");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveCurrentPersona: () => Promise.resolve(current),
      resolveDefaultPersona: () => Promise.resolve(fallback),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(current);
  });

  test("the connected persona (character-lock hop) beats the Current persona (#2)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const connected = await seedPersona(host, "persona_connected");
    const current = await seedPersona(host, "persona_current");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveConnectedPersona: () => Promise.resolve(connected),
      resolveCurrentPersona: () => Promise.resolve(current),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(connected);
  });

  test("an explicit anchor beats the Current persona (#2) too", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const explicit = await seedPersona(host, "persona_explicit");
    const current = await seedPersona(host, "persona_current");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveCurrentPersona: () => Promise.resolve(current),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({
      principal: principal(host),
      characterIds: [aria],
      anchorPersonaId: explicit,
    });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(explicit);
  });

  test("no current persona (resolves null): the Default seed (#1) still anchors", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const fallback = await seedPersona(host, "persona_fallback");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
      resolveCurrentPersona: () => Promise.resolve(null),
      resolveDefaultPersona: () => Promise.resolve(fallback),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBe(fallback);
  });
});

// R2 retired the creation-time draft carry (seedGreetings/rosterOverrides/groupConfig/roomOverrides —
// chat-creation-draft-mode-replacement.md §4.4): those config edits are POST-CREATE writes now
// (`setGroupConfig`/`setSeatKnobs`/`setRoomOverrides`, proved in their own verb suites). `injections`
// is the one founding-shape param that survives — pre-authored injections are part of what the room is
// FOUNDED with, not a post-create tuning knob, so it stays a creation-time input.
describe("startChat — founding injections (creation-time only)", () => {
  test("injections seed founding chat_injections rows in the same creation batch", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardWith("Aria", "")) });
    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({
      principal: principal(host),
      characterIds: [aria],
      opening: "none",
      injections: [{ position: "in_chat", depth: 2, role: "system", content: "stay in character" }],
    });
    const rows = await db.select().from(chatInjections).where(eq(chatInjections.chatId, chat.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toBe("stay in character");
    expect(rows[0]?.depth).toBe(2);
  });
});

describe("startChat — PD-65 temporary rooms are HIDDEN from the library", () => {
  // The flag landing on the row is covered above; what the client half depends on — and what nobody had
  // asserted — is that a temporary room never appears in `listChats`. That exclusion is the ENTIRE reason
  // the launcher can offer a temp room without polluting the chats list, and it must hold in BOTH branches
  // of listMemberChats (an `includeArchived` caller must not lift it either).
  test("a temporary room is absent from listChats — with AND without includeArchived", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardWith("Aria", "Hello.")) });
    const { startChat } = createStartChat(ctx, makeDeps());

    const temp = await startChat({ principal: principal(host), characterIds: [aria], temporary: true, opening: "none" });
    const permanent = await startChat({ principal: principal(host), characterIds: [aria], opening: "none" });
    // R0: a freshly minted room is ALSO a husk, and the husk lens would hide the permanent one too — so
    // claim it, isolating what this arm is about (the `temporary` exclusion) from the husk arm beside it.
    await db.update(chats).set({ startedAt: FROZEN_AT }).where(eq(chats.id, permanent.chat.id));
    await db.update(chats).set({ startedAt: FROZEN_AT }).where(eq(chats.id, temp.chat.id));

    expect((await listMemberChats(db, host, { limit: TEST_PAGE_LIMIT })).map((c) => c.id)).toEqual([permanent.chat.id]);
    expect((await listMemberChats(db, host, { includeArchived: true, limit: TEST_PAGE_LIMIT })).map((c) => c.id)).toEqual([permanent.chat.id]);
    // The row really does exist — it is hidden, not un-created (turns have to be able to run in it).
    expect(await db.select().from(chats).where(eq(chats.id, temp.chat.id))).toHaveLength(1);
  });
});
