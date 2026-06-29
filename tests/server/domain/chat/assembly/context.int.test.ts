// assembly/context — RESOLVE→GATHER→BUILD (chat.md Part II §2/§3/§4/§5). Pins the doc's load-bearing wins:
// keyword-match-sees-PENDING-user-text (§3 rule 4, the two-phase lag-kill), per-entry render-ONCE
// (macro→wiFormat-wrap, §3 rules 1-3), the ONE injection list + ONE budget pass (§4 — lore dropped by
// priority, operator intent spared), WI position routing, and the immutable/pure ctx (§5 — two calls equal).
import type { CharacterCard } from "@orb/contracts/character";
import type { ChatInjection } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { chatBooks, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test } from "vitest";
import { buildAssembleContext } from "../../../../../packages/server/src/domain/chat/assembly/context";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/contract/context";
import { freshDb } from "../../../../support/db";
import { FROZEN_AT, makeChatContext, seedCharacter, seedChat, seedUser } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

function cardOf(name: string): CharacterCard {
  return {
    name,
    description: `${name} the knight`,
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
    regexScripts: [],
    extensions: null,
    avatarAssetId: null,
    refinery: null,
  };
}

/** A ChatContext whose getCard returns `card` for any id (the injected live-card read — D28). */
function ctxWithCard(card: CharacterCard): ChatContext {
  return makeChatContext(db, { getCard: () => Promise.resolve(card) });
}

/** Attach a chat-scope book with one entry to `chatId`. `keys` ⇒ keyword scope; `inject` ⇒ depth-inject;
 *  else always-scope. */
async function attachChatEntry(
  owner: UserId,
  chatId: string,
  key: string,
  entry: { content: string; keys?: string[]; priority?: number; inject?: { depth: number } },
): Promise<void> {
  const bookId = castId<WorldBookId>(`world_book_${key}`);
  await db
    .insert(worldBooks)
    .values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT });
  await db.insert(worldEntries).values({
    id: castId<WorldEntryId>(`world_entry_${key}`),
    worldBookId: bookId,
    title: key,
    content: entry.content,
    keys: entry.keys ?? null,
    enabled: true,
    priority: entry.priority ?? 0,
    ignoreBudget: false,
    metadata: entry.inject ? { inject: { depth: entry.inject.depth } } : null,
    createdAt: FROZEN_AT,
  });
  await db
    .insert(chatBooks)
    .values({ chatId: castId(chatId), worldBookId: bookId, createdAt: FROZEN_AT });
}

interface InputOver {
  pendingUserText?: string;
  recentMessages?: string[];
  userInjections?: ChatInjection[];
  injectionTokenBudget?: number;
}
function inputOf(
  chatId: string,
  ownerId: UserId,
  castIds: CharacterId[],
  over: InputOver = {},
): Parameters<typeof buildAssembleContext>[1] {
  return {
    chatId: castId(chatId),
    ownerId,
    castCharacterIds: castIds,
    personaIds: [],
    promptConfig: DEFAULT_PROMPT_CONFIG,
    personas: { anchor: null, active: null },
    worldInfoEnabled: true,
    recentMessages: over.recentMessages ?? [],
    userInjections: over.userInjections ?? [],
    variableValues: {},
    model: "test-model",
    injectionTokenBudget: over.injectionTokenBudget ?? 0,
    ...(over.pendingUserText !== undefined ? { pendingUserText: over.pendingUserText } : {}),
  };
}

describe("buildAssembleContext — GATHER keyword match (the two-phase lag-kill)", () => {
  test("a keyword entry fires on the PENDING user text (same turn), not one turn later", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    // Pending text mentions the key → fires THIS turn, flagged as a latest-user match.
    const fired = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], { pendingUserText: "a dragon appears" }),
    );
    expect(fired.chatInjections?.map((i) => i.content)).toContain("DRAGON LORE");
    expect(fired.wiTrace?.matchedKeys).toContainEqual({
      key: "dragon",
      matchedLatestUserMessage: true,
    });

    // No pending text + not in the recent window → does NOT fire (keyword gate holds).
    const quiet = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    expect(quiet.chatInjections?.map((i) => i.content)).not.toContain("DRAGON LORE");
  });
});

describe("buildAssembleContext — BUILD render-once + position routing", () => {
  test("a WI entry renders its macros ONCE and wraps in wiFormat once", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // Always-scope (no keys) so it always fires; content carries {{char}}.
    await attachChatEntry(host, chatId, "k", { content: "{{char}} hoards gold" });
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      formatStrings: { wiFormat: "[Lore: {{entry}}]" },
    };
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
    });
    // {{char}} resolved to the cast primary; wiFormat wrapped exactly once.
    expect(out.chatInjections?.map((i) => i.content)).toContain("[Lore: Aria hoards gold]");
  });

  test("position routing: always → in_static; keyword(fired) → in_prompt; inject → in_chat", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "always", { content: "ALWAYS" });
    await attachChatEntry(host, chatId, "kw", { content: "KW", keys: ["spell"] });
    await attachChatEntry(host, chatId, "depth", { content: "DEPTH", inject: { depth: 2 } });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], { pendingUserText: "cast a spell" }),
    );
    const byContent = Object.fromEntries(
      (out.chatInjections ?? []).map((i) => [i.content, i.position]),
    );
    expect(byContent["ALWAYS"]).toBe("in_static");
    expect(byContent["KW"]).toBe("in_prompt");
    expect(byContent["DEPTH"]).toBe("in_chat");
  });
});

describe("buildAssembleContext — the ONE injection list + ONE budget pass (§4)", () => {
  test("budget drops lower-priority lore by priority; operator chat_injections are spared", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // Two always entries ~2 tokens each (8 printable chars). Budget=2 keeps the higher-priority one.
    await attachChatEntry(host, chatId, "hi", { content: "AAAAAAAA", priority: 10 });
    await attachChatEntry(host, chatId, "lo", { content: "BBBBBBBB", priority: 1 });
    const userInjections: ChatInjection[] = [
      { position: "in_static", depth: 0, role: "system", content: "OPERATOR" },
    ];
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], { userInjections, injectionTokenBudget: 2 }),
    );
    const contents = (out.chatInjections ?? []).map((i) => i.content);
    expect(contents).toContain("AAAAAAAA"); // higher priority kept
    expect(contents).not.toContain("BBBBBBBB"); // lower priority dropped
    expect(contents).toContain("OPERATOR"); // operator intent spared (ignoreBudget)
    expect(out.wiTrace?.dropped).toContainEqual({ id: "world_entry_lo", reason: "budget" });
  });
});

describe("buildAssembleContext — immutable/pure (§5)", () => {
  test("two calls with the same inputs produce equal injection lists (deterministic, no mutation)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "LORE" });
    const ctx = ctxWithCard(cardOf("Aria"));
    const a = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    const b = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    expect(a.chatInjections).toEqual(b.chatInjections);
    // The cast resolved via the injected getCard (D28) — the primary is the first card.
    expect(a.character.name).toBe("Aria");
  });
});
