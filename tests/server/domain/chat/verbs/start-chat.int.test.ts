// `startChat` (chat.md Part I `verbs/start-chat.ts`) — proves against a real libSQL db: the room is minted with
// the caller as `host` + the founding characters as members (D28 live-identity roster — `chat_participants`
// references the live `characters` row), the opening seeds per the resolved `OpeningPolicy` (first-message =
// the primary's greeting VERBATIM; greet-all = every founding character; none = nothing; generate = delegated
// to the turn engine as a `kind:"opening"` run), and `chatCreated` (+ a `messageCommitted` per seeded greeting)
// fires. Reached through the BUNDLE `createStartChat(ctx, deps)`.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, ParticipantView } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chatParticipants, chats, messages, personas } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, asc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import type {
  TurnEngine,
  TurnOutcome,
  TurnPrep,
} from "../../../../../packages/server/src/domain/chat/contract/results";
import { createStartChat } from "../../../../../packages/server/src/domain/chat/verbs/start-chat";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedUser } from "../_support";

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

/** A full canonical card with a single greeting (D28 live read; the rest is empty). */
function cardWith(name: string, greeting: string): CharacterCard {
  return {
    name,
    description: null,
    personality: null,
    scenario: null,
    greetings: greeting.length > 0 ? [greeting] : [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    regexScripts: [],
    extensions: null,
    avatarAssetId: null,
    refinery: null,
  };
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

/** A throwing engine/connection/assemble stub for the verbatim + none paths (they never delegate). */
const notReached = (): never => {
  throw new Error("dep not reached in this path");
};

function makeDeps(
  over: {
    readonly engine?: TurnEngine;
    readonly resolveConnection?: () => Promise<ResolvedConnection>;
  } = {},
): Parameters<typeof createStartChat>[1] {
  return {
    emit,
    loadParticipantViews,
    engine: over.engine ?? { runTurn: notReached },
    resolveConnection: over.resolveConnection ?? notReached,
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

describe("startChat — canon-mutator stats push (stats.md)", () => {
  test("creation pushes the chat-created counters + the seeded greeting contribution", async () => {
    const host = await seedUser(db, "host");
    const aria = await seedCharacter(db, host, "aria");
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "Hello there friend.")),
      applyStatsDelta: (_b, _d, delta) => {
        deltas.push(delta as StatsDelta);
      },
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    await startChat({ principal: principal(host), characterIds: [aria] });

    expect(deltas).toHaveLength(2);
    const created = deltas.find((d) => d.chats === 1);
    expect(created?.chatsCreated).toBe(1);
    expect(created?.characterId).toBe(aria);
    const greeting = deltas.find((d) => d.assistantTurns === 1);
    expect(greeting?.characterId).toBe(aria);
    expect(greeting?.assistantWords).toBe(3);
    expect(new Set(deltas.map((d) => d.ownerId))).toEqual(new Set([host]));
  });
});

describe("startChat — lazy room creation + opening", () => {
  test("first-message (solo): seeds the primary greeting VERBATIM; caller is host; D28 live roster", async () => {
    const host = await seedUser(db, "host");
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
    const host = await seedUser(db, "host");
    const aria = await seedCharacter(db, host, "aria");
    const borg = await seedCharacter(db, host, "borg");
    const ctx = makeChatContext(db, {
      getCard: ({ characterId }) =>
        Promise.resolve(
          characterId === aria ? cardWith("Aria", "Aria hi") : cardWith("Borg", "Borg hi"),
        ),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { opening } = await startChat({ principal: principal(host), characterIds: [aria, borg] });

    expect(opening?.messages.map((m) => m.content)).toEqual(["Aria hi", "Borg hi"]);
    expect(opening?.messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(opening?.messages.map((m) => m.characterId)).toEqual([aria, borg]);
  });

  test("greet-all: a character with no greeting is skipped (never an empty seeded row)", async () => {
    const host = await seedUser(db, "host");
    const aria = await seedCharacter(db, host, "aria");
    const mute = await seedCharacter(db, host, "mute");
    const ctx = makeChatContext(db, {
      getCard: ({ characterId }) =>
        Promise.resolve(characterId === aria ? cardWith("Aria", "Aria hi") : cardWith("Mute", "")),
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
    const host = await seedUser(db, "host");
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

  test("generate: delegates the opening to the turn engine (kind:'opening') and returns its outcome", async () => {
    const host = await seedUser(db, "host");
    const aria = await seedCharacter(db, host, "aria");
    const engineOutcome: TurnOutcome = { messages: [], aborted: false };
    const runTurn = vi.fn(
      (_prep: TurnPrep): Promise<TurnOutcome> => Promise.resolve(engineOutcome),
    );
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "ignored")),
    });

    const deps = makeDeps({
      engine: { runTurn },
      resolveConnection: () =>
        Promise.resolve({ model: "test-model" } as unknown as ResolvedConnection),
    });
    const { startChat } = createStartChat(ctx, deps);
    const { chat, opening } = await startChat({
      principal: principal(host),
      characterIds: [aria],
      opening: "generate",
    });

    expect(opening).toBe(engineOutcome);
    expect(runTurn).toHaveBeenCalledTimes(1);
    const prep = runTurn.mock.calls[0]?.[0];
    expect(prep?.kind).toBe("opening");
    expect(prep?.speakerCharacterId).toBe(aria);
    // The creator IS the host of a brand-new room (the D19 triple collapses to the caller).
    expect(prep?.runAsUserId).toBe(host);
    expect(prep?.triggeredBy).toBe(host);
    // PD-63: the opening turn prompt is the RESOLVED guided `opening` template ({{char}} live), not a
    // neutral nudge (chat.md §6 — the action whose resolved template IS the turn prompt).
    expect(prep?.appendUserTurn).toContain("greet me as Aria would");
    // No verbatim greeting was seeded on the generate path.
    const rows = await db.select().from(messages).where(eq(messages.chatId, chat.id));
    expect(rows).toHaveLength(0);
  });

  test("atomic: the chat row + the full roster commit together", async () => {
    const host = await seedUser(db, "host");
    const aria = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardWith("Aria", "hi")) });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const roster = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chat.id))
      .orderBy(asc(chatParticipants.joinSeq));
    expect(roster).toHaveLength(2);
    expect(roster.filter((r) => r.role === "host")).toHaveLength(1);
    expect(roster.every((r) => r.joinSeq === 0)).toBe(true);
  });

  test("a foreign/unknown founding character is refused NOT_FOUND — no ghost roster row (PD-21)", async () => {
    const host = await seedUser(db, "host");
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
    const host = await seedUser(db, "host");
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
    const host = await seedUser(db, "host");
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
    const host = await seedUser(db, "host");
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
    const host = await seedUser(db, "host");
    const aria = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardWith("Aria", "hi")),
    });

    const { startChat } = createStartChat(ctx, makeDeps());
    const { chat } = await startChat({ principal: principal(host), characterIds: [aria] });

    const [row] = await db.select().from(chats).where(eq(chats.id, chat.id));
    expect(row?.anchorPersonaId).toBeNull();
  });
});
