// substrate/assemble-gather — the CHAT-INTERNAL gather (the impure shell before the pure BUILD core). Proves
// against a real libSQL db: the chat-owned half (canon/injections/variables) is read + merged with the FOREIGN
// DTO; `recallMemory` is invoked over the shared/merged bucket (the group char) with the right scope; the
// host-tier regex union is global ∪ preset ∪ cast in order; the FOREIGN injection budget is applied; memory-off
// short-circuits with no search; and the SEND USER_INPUT regex still transforms through the gather (the sink).

import type { CharacterCard } from "@orb/contracts/character";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { chatBooks, chatInjections, chats, messages, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ForeignInputs } from "../../../../../packages/server/src/domain/chat/contract/foreign.ts";
import { gatherAssembleContext } from "../../../../../packages/server/src/domain/chat/substrate/assemble-gather.ts";
import type { DatabankGatherParams } from "../../../../../packages/server/src/domain/databank/contract/params.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";
import { fakeSearchDigests, GROUP_CHAR, seedDigest } from "../memory/_support.ts";

const MIN_MS = 60_000;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** A full canonical card (D28 live read) carrying `regexScripts` (the host-tier cast source). */
function cardOf(name: string, regexScripts: RegexScriptRow[] = []): CharacterCard {
  return {
    name,
    description: "",
    personality: null,
    scenario: null,
    greetings: [],
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
    regexScripts,
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
}

/** A fully-defaulted host-tier `RegexScript` (via the parse seam) for the given placement. */
function regexScript(label: string, find: string, replace: string, placement: "USER_INPUT" | "WORLD_INFO"): RegexScriptRow {
  return regexScriptSchema.parse({
    // D121-E: a row id is a real `regex_script_…` TypeID; the readable label rides on `name`.
    id: mintTypeId(ID_PREFIX.regexScript),
    name: label,
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: find,
    replaceString: replace,
    placement: [placement],
  });
}

function foreignOf(over: Partial<ForeignInputs> = {}): ForeignInputs {
  return {
    promptConfig: DEFAULT_PROMPT_CONFIG,
    personas: { anchor: null, active: null },
    scanDepth: 6,
    injectionTokenBudget: 0,
    ...over,
  };
}

/** Seed a solo room (host + one character), returning the ids. */
async function seedRoom(key: string): Promise<{ host: UserId; chatId: ChatId; aria: CharacterId }> {
  const host = await seedUser(db, castId<Handle>(`${key}_host`));
  const chatId = await seedChat(db, key);
  const aria = await seedCharacter(db, host, `${key}_aria`);
  await seedParticipant(db, { chatId, key: `${key}_h`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `${key}_c`, characterId: aria });
  return { host, chatId, aria };
}

/** Attach a chat-scope, always-fire WI entry (priority for the budget walk). */
async function attachAlwaysEntry(owner: UserId, chatId: ChatId, key: string, entry: { readonly content: string; readonly priority: number }): Promise<void> {
  const { content, priority } = entry;
  const bookId = castId<WorldBookId>(`world_book_${key}`);
  await db.insert(worldBooks).values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT });
  await db.insert(worldEntries).values({
    id: castId<WorldEntryId>(`world_entry_${key}`),
    worldBookId: bookId,
    title: key,
    content,
    keys: null,
    enabled: true,
    priority,
    ignoreBudget: false,
    metadata: null,
    createdAt: FROZEN_AT,
  });
  await db.insert(chatBooks).values({ chatId: castId(chatId), worldBookId: bookId, createdAt: FROZEN_AT });
}

describe("gatherAssembleContext — the chat-internal merge", () => {
  test("reads canon / injections / variables and merges with the FOREIGN DTO", async () => {
    const { host, chatId, aria } = await seedRoom("merge");
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hello dragon" });
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: aria, content: "roar" });
    await db.insert(chatInjections).values({
      id: castId("chat_injection_1"),
      chatId: castId(chatId),
      position: "in_static",
      depth: 0,
      role: "system",
      content: "OPERATOR",
      createdAt: FROZEN_AT,
    });
    await db
      .update(chats)
      .set({ variableValues: { mood: "calm" } })
      .where(eq(chats.id, castId(chatId)));
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardOf("Aria")) });

    const out = await gatherAssembleContext(
      ctx,
      {
        chatId: castId(chatId),
        runAsUserId: host,
        model: "m",
        castCharacterIds: [aria],
        personaIds: [],
      },
      foreignOf(),
    );

    expect(out.recentMessages).toEqual(["hello dragon", "roar"]);
    expect(out.lastUserMessage).toBe("hello dragon");
    expect(out.lastCharMessage).toBe("roar");
    expect(out.lastMessage).toBe("roar");
    expect(out.variableValues).toEqual({ mood: "calm" });
    // The operator chat_injection survives the (unbudgeted) pass and rides the built injection list.
    expect((out.chatInjections ?? []).some((i) => i.content.includes("OPERATOR"))).toBe(true);
  });

  // parity-plus P6 (§12, D6): {{idle_duration}} = time since the last activity EXCLUDING the in-flight message.
  // The in-flight turn here is the newest COMMITTED user row (no pendingUserText) — so idle measures from the row
  // BEFORE it (the prior beat), never ~0. Two rows: prior at now−8min, in-flight at now ⇒ 8 minutes.
  test("idleDuration excludes the in-flight (newest committed) message — measures from the prior beat", async () => {
    const { host, chatId, aria } = await seedRoom("idle");
    const prior = await seedMessage(db, chatId, 1, { role: "assistant", characterId: aria, content: "earlier" });
    const inflight = await seedMessage(db, chatId, 2, { role: "user", authorUserId: host, content: "you there?" });
    // ctx.now() is FROZEN_AT; the prior beat committed 8 minutes before, the in-flight one AT now.
    await db
      .update(messages)
      .set({ createdAt: FROZEN_AT - 8 * MIN_MS })
      .where(eq(messages.id, prior.messageId));
    await db.update(messages).set({ createdAt: FROZEN_AT }).where(eq(messages.id, inflight.messageId));
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardOf("Aria")) });

    const out = await gatherAssembleContext(
      ctx,
      { chatId: castId(chatId), runAsUserId: host, model: "m", castCharacterIds: [aria], personaIds: [] },
      foreignOf(),
    );
    // The in-flight (seq 2, at now) is excluded ⇒ idle = now − prior(now−8min) = "8 minutes" (NOT ~0).
    expect(out.idleDuration).toBe("8 minutes");
  });

  test('idleDuration is unset on a fresh one-message chat (no prior activity ⇒ the marker resolves "")', async () => {
    const { host, chatId, aria } = await seedRoom("idle-fresh");
    // The single committed row IS the in-flight message — excluding it leaves NO prior activity.
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "first" });
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardOf("Aria")) });

    const out = await gatherAssembleContext(
      ctx,
      { chatId: castId(chatId), runAsUserId: host, model: "m", castCharacterIds: [aria], personaIds: [] },
      foreignOf(),
    );
    expect(out.idleDuration).toBeUndefined();
  });

  test("excludedFromPrompt rows are dropped from the recent window + last-message family", async () => {
    const { host, chatId, aria } = await seedRoom("hidden");
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "visible" });
    await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: aria,
      content: "HIDDEN",
      excludedFromPrompt: true,
    });
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardOf("Aria")) });

    const out = await gatherAssembleContext(
      ctx,
      {
        chatId: castId(chatId),
        runAsUserId: host,
        model: "m",
        castCharacterIds: [aria],
        personaIds: [],
      },
      foreignOf(),
    );

    expect(out.recentMessages).toEqual(["visible"]);
    expect(out.lastMessage).toBe("visible");
    expect(out.lastCharMessage).toBeUndefined();
  });
});

describe("gatherAssembleContext — memory recall (the shared/merged bucket)", () => {
  test("recall runs over the synthetic group character's scope (mixC → searchDigests)", async () => {
    const { host, chatId, aria } = await seedRoom("recall");
    await seedCharacter(db, host, "group"); // FK for GROUP_CHAR
    await seedDigest(db, {
      chatId: castId(chatId),
      scopedCharacterId: GROUP_CHAR,
      tier: 0,
      blockIdx: 0,
    });
    const search = fakeSearchDigests([]);
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      findSyntheticGroupCharacter: () => Promise.resolve({ characterId: GROUP_CHAR }),
      searchDigests: search.fn,
    });

    await gatherAssembleContext(
      ctx,
      {
        chatId: castId(chatId),
        runAsUserId: host,
        model: "m",
        castCharacterIds: [aria],
        personaIds: [],
      },
      foreignOf({ memoryConfig: { mode: "mixC" } }),
    );

    expect(search.calls).toHaveLength(1);
    expect(search.calls.at(0)?.scope.chat).toBe(chatId);
    expect(search.calls.at(0)?.scopedCharacterId).toBe(GROUP_CHAR);
  });

  test("memory-off → empty memory, no embed (the recall early-return)", async () => {
    const { host, chatId, aria } = await seedRoom("off");
    await seedCharacter(db, host, "group");
    await seedDigest(db, {
      chatId: castId(chatId),
      scopedCharacterId: GROUP_CHAR,
      tier: 0,
      blockIdx: 0,
    });
    const search = fakeSearchDigests([]);
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      findSyntheticGroupCharacter: () => Promise.resolve({ characterId: GROUP_CHAR }),
      searchDigests: search.fn,
    });

    const out = await gatherAssembleContext(
      ctx,
      {
        chatId: castId(chatId),
        runAsUserId: host,
        model: "m",
        castCharacterIds: [aria],
        personaIds: [],
      },
      foreignOf({ memoryConfig: { mode: "off" } }),
    );

    expect(out.memory).toBe("");
    expect(search.calls).toHaveLength(0);
  });
});

describe("gatherAssembleContext — the {{databank}} slot GATHER (DB6)", () => {
  test("op absent ⇒ databank unset (byte-identical no-op)", async () => {
    const { host, chatId, aria } = await seedRoom("db_absent");
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "dragons" });
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardOf("Aria")) });

    const out = await gatherAssembleContext(
      ctx,
      { chatId: castId(chatId), runAsUserId: host, model: "m", castCharacterIds: [aria], personaIds: [], pendingUserText: "tell me more" },
      foreignOf(),
    );

    expect(out.databank).toBeUndefined();
  });

  test("op returns null ⇒ databank unset (same empty resolution as absent)", async () => {
    const { host, chatId, aria } = await seedRoom("db_null");
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "dragons" });
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      gatherDatabank: () => Promise.resolve(null),
    });

    const out = await gatherAssembleContext(
      ctx,
      { chatId: castId(chatId), runAsUserId: host, model: "m", castCharacterIds: [aria], personaIds: [], pendingUserText: "tell me more" },
      foreignOf(),
    );

    expect(out.databank).toBeUndefined();
  });

  test("op returns text ⇒ slot set; query = pending + last committed turns", async () => {
    const { host, chatId, aria } = await seedRoom("db_hit");
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "first turn" });
    await seedMessage(db, chatId, 2, { role: "assistant", characterId: aria, content: "second turn" });
    const calls: { chatId: ChatId; queryText: string; tokenBudget: number }[] = [];
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      gatherDatabank: (args) => {
        calls.push(args);
        return Promise.resolve({ text: "# Doc\nretrieved passage" });
      },
    });

    const out = await gatherAssembleContext(
      ctx,
      { chatId: castId(chatId), runAsUserId: host, model: "m", castCharacterIds: [aria], personaIds: [], pendingUserText: "tell me more about that" },
      foreignOf(),
    );

    expect(out.databank).toBe("# Doc\nretrieved passage");
    expect(calls).toHaveLength(1);
    // Most-recent-first: the pending message, then the last 2 committed turns.
    expect(calls[0]?.queryText).toBe("tell me more about that\nsecond turn\nfirst turn");
    expect(calls[0]?.chatId).toBe(chatId);
    expect(calls[0]?.tokenBudget).toBeGreaterThan(0);
  });

  // DB6 settings wire: the host's `UserSettings.databank` (retrieval k/minScore/rerank + slotTokenBudget),
  // threaded via ForeignInputs, must reach the gather op so it can pass them to search.documents.
  test("ForeignInputs databank settings reach the gather op (retrieval params + slot budget)", async () => {
    const { host, chatId, aria } = await seedRoom("db_settings");
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "q" });
    const calls: DatabankGatherParams[] = [];
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      gatherDatabank: (args) => {
        calls.push(args);
        return Promise.resolve({ text: "# Doc\nhit" });
      },
    });

    await gatherAssembleContext(
      ctx,
      { chatId: castId(chatId), runAsUserId: host, model: "m", castCharacterIds: [aria], personaIds: [], pendingUserText: "ask" },
      foreignOf({ databankRetrieval: { k: 3, minScore: 0.4, rerank: true }, databankSlotTokenBudget: 2048 }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.k).toBe(3);
    expect(calls[0]?.minScore).toBe(0.4);
    expect(calls[0]?.rerank).toBe(true);
    expect(calls[0]?.tokenBudget).toBe(2048);
  });

  test("no databank settings in ForeignInputs ⇒ gather op gets no retrieval params (byte-identity pin)", async () => {
    const { host, chatId, aria } = await seedRoom("db_default");
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "q" });
    const calls: DatabankGatherParams[] = [];
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      gatherDatabank: (args) => {
        calls.push(args);
        return Promise.resolve({ text: "# Doc\nhit" });
      },
    });

    await gatherAssembleContext(
      ctx,
      { chatId: castId(chatId), runAsUserId: host, model: "m", castCharacterIds: [aria], personaIds: [], pendingUserText: "ask" },
      foreignOf(),
    );

    expect(calls).toHaveLength(1);
    // Absent ⇒ omitted (search.documents falls to its own defaults = the databank defaults).
    expect(calls[0]?.k).toBeUndefined();
    expect(calls[0]?.minScore).toBeUndefined();
    expect(calls[0]?.rerank).toBeUndefined();
  });
});

describe("gatherAssembleContext — the host-tier regex union (D53 as amended by D121-E)", () => {
  // THE SOURCE-SET PIN. The gather no longer hand-assembles the union from three blobs — it calls the ONE
  // injected `resolveRegexSources` op with the turn's frozen `runAsUserId`, the resolved preset, the roster's
  // cast, and the room, then unions what comes back. This test pins BOTH halves: that the gather passes the
  // right scope keys, and that it preserves the resolver's tier order end-to-end.
  test("union = global ∪ preset ∪ cast ∪ room, in that order, from the injected scope resolver", async () => {
    const { host, chatId, aria } = await seedRoom("regex");
    const seen: { ownerId?: string; chatId?: ChatId; characterIds?: readonly string[] } = {};
    const ctx = makeChatContext(db, {
      resolveRegexSources: (args) => {
        seen.ownerId = args.ownerId;
        seen.chatId = args.chatId;
        seen.characterIds = args.characterIds;
        return Promise.resolve({
          hostGlobal: [regexScript("global", "x", "y", "WORLD_INFO")],
          preset: [regexScript("preset", "p", "q", "WORLD_INFO")],
          cast: [regexScript("cast", "a", "b", "WORLD_INFO")],
          chat: [regexScript("room", "r", "s", "WORLD_INFO")],
        });
      },
    });

    const out = await gatherAssembleContext(
      ctx,
      {
        chatId: castId(chatId),
        runAsUserId: host,
        model: "m",
        castCharacterIds: [aria],
        personaIds: [],
      },
      foreignOf(),
    );

    expect((out.hostTierRegexScripts ?? []).map((s) => s.name)).toEqual(["global", "preset", "cast", "room"]);
    // The scope keys the gather handed the resolver: the FROZEN host (D19 — never the calling member), the
    // room, and the roster's cast in order. A drift here is a silently wrong (or cross-tenant) source set.
    expect(seen.ownerId).toBe(host);
    expect(seen.chatId).toBe(chatId);
    expect(seen.characterIds).toEqual([aria]);
  });
});

describe("gatherAssembleContext — the FOREIGN injection budget is applied", () => {
  test("a low-priority WI entry is dropped under the foreign injectionTokenBudget", async () => {
    const { host, chatId, aria } = await seedRoom("budget");
    await attachAlwaysEntry(host, chatId, "hi", { content: "AAAAAAAA", priority: 10 });
    await attachAlwaysEntry(host, chatId, "lo", { content: "BBBBBBBB", priority: 1 });
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardOf("Aria")) });

    const out = await gatherAssembleContext(
      ctx,
      {
        chatId: castId(chatId),
        runAsUserId: host,
        model: "m",
        castCharacterIds: [aria],
        personaIds: [],
      },
      foreignOf({ injectionTokenBudget: 2 }),
    );

    // Always-scope lore routes to the before-anchor (DEFAULT_PROMPT_CONFIG ships the marker); budget still drops lo.
    expect(out.worldInfoBefore).toContain("AAAAAAAA");
    expect(out.worldInfoBefore).not.toContain("BBBBBBBB");
    expect(out.wiTrace?.dropped).toContainEqual({ id: "world_entry_lo", reason: "budget" });
  });
});

describe("gatherAssembleContext — SEND USER_INPUT regex flows through the gather", () => {
  test("the post-regex text is surfaced on the sink + folded into {{input}}", async () => {
    const { host, chatId, aria } = await seedRoom("send");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      // The SEND leg's script arrives through the D121-E scope resolver, not a foreign blob.
      resolveRegexSources: () => Promise.resolve({ hostGlobal: [regexScript("u", "wyrm", "dragon", "USER_INPUT")], preset: [], cast: [], chat: [] }),
    });
    const sink: { sendUserText?: string } = {};

    const out = await gatherAssembleContext(
      ctx,
      {
        chatId: castId(chatId),
        runAsUserId: host,
        model: "m",
        castCharacterIds: [aria],
        personaIds: [],
        pendingUserText: "a wyrm appears",
      },
      foreignOf(),
      sink,
    );

    expect(sink.sendUserText).toBe("a dragon appears");
    expect(out.currentInput).toBe("a dragon appears");
  });
});
