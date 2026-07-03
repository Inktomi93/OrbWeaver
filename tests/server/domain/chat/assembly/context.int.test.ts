// assembly/context — RESOLVE→GATHER→BUILD (chat.md Part II §2/§3/§4/§5). Pins the doc's load-bearing wins:
// keyword-match-sees-PENDING-user-text (§3 rule 4, the two-phase lag-kill), per-entry render-ONCE
// (macro→wiFormat-wrap, §3 rules 1-3), the ONE injection list + ONE budget pass (§4 — lore dropped by
// priority, operator intent spared), WI position routing, and the immutable/pure ctx (§5 — two calls equal).
import type { CharacterCard } from "@orb/contracts/character";
import type { ChatInjection } from "@orb/contracts/chat";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { chatBooks, worldBooks, worldEntries } from "@orb/db";
import { ZWSP } from "@orb/kit/guided";
import type { CharacterId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { buildAssembleContext } from "../../../../../packages/server/src/domain/chat/assembly/context";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/contract/context";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
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
  hostTierRegexScripts?: RegexScript[];
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
    recentMessages: over.recentMessages ?? [],
    userInjections: over.userInjections ?? [],
    variableValues: {},
    model: "test-model",
    injectionTokenBudget: over.injectionTokenBudget ?? 0,
    ...(over.pendingUserText !== undefined ? { pendingUserText: over.pendingUserText } : {}),
    ...(over.hostTierRegexScripts !== undefined
      ? { hostTierRegexScripts: over.hostTierRegexScripts }
      : {}),
  };
}

/** A fully-defaulted host-tier `RegexScript` (via the parse seam) for the given placement. */
function regexScript(
  id: string,
  find: string,
  replace: string,
  placement: "USER_INPUT" | "WORLD_INFO",
): RegexScript {
  return regexScriptSchema.parse({
    id,
    name: id,
    findRegex: find,
    replaceString: replace,
    placement: [placement],
  });
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
    // {{char}} resolved to the cast primary; wiFormat wrapped exactly once. Always-scope ⇒ the before-anchor
    // (DEFAULT_PROMPT_CONFIG ships the world_info_before marker — ST parity).
    expect(out.worldInfoBefore).toContain("[Lore: Aria hoards gold]");
  });

  test("position routing: always → world_info_before anchor; keyword(fired) → in_prompt; inject → in_chat", async () => {
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
    // Always-scope routes to the before-anchor (the default has the marker); keyword/depth ride the injection list.
    expect(out.worldInfoBefore).toContain("ALWAYS");
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
    // Always-scope lore routes to the before-anchor; the operator injection stays in the in_static list.
    expect(out.worldInfoBefore).toContain("AAAAAAAA"); // higher priority kept
    expect(out.worldInfoBefore).not.toContain("BBBBBBBB"); // lower priority dropped
    expect((out.chatInjections ?? []).map((i) => i.content)).toContain("OPERATOR"); // spared (ignoreBudget)
    expect(out.wiTrace?.dropped).toContainEqual({ id: "world_entry_lo", reason: "budget" });
  });
});

describe("buildAssembleContext — SEND USER_INPUT regex (D53; chat.md §2/§3)", () => {
  test("the WI haystack + the out-param BOTH see the POST-regex text (no divergence)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // The entry is keyed on "dragon"; the RAW pending text says "wyrm". A USER_INPUT regex rewrites
    // wyrm→dragon, so the keyword fires on the POST-regex text — proving the haystack sees the transform.
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out: { sendUserText?: string } = {};
    const result = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        pendingUserText: "a wyrm appears",
        hostTierRegexScripts: [regexScript("u", "wyrm", "dragon", "USER_INPUT")],
      }),
      out,
    );
    // The post-regex user text is surfaced for the verb to persist (canon-mutating at write — §7).
    expect(out.sendUserText).toBe("a dragon appears");
    // …and the keyword entry fired on it (the two-phase haystack saw the transformed text).
    expect(result.chatInjections?.map((i) => i.content)).toContain("DRAGON LORE");
    expect(result.wiTrace?.matchedKeys).toContainEqual({
      key: "dragon",
      matchedLatestUserMessage: true,
    });
  });

  test("macros resolve in the USER_INPUT replace TEMPLATE (author-side; macros-before-regex)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out: { sendUserText?: string } = {};
    await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        pendingUserText: "I greet NAME",
        // The replace template `{{char}}` resolves to the cast primary (Aria) — macros run on the template.
        hostTierRegexScripts: [regexScript("u", "NAME", "{{char}}", "USER_INPUT")],
      }),
      out,
    );
    expect(out.sendUserText).toBe("I greet Aria");
  });

  test("no host scripts → the raw pending text is used + the sink stays unset", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out: { sendUserText?: string } = {};
    const result = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], { pendingUserText: "a wyrm appears" }),
      out,
    );
    expect(out.sendUserText).toBeUndefined();
    // "wyrm" never became "dragon" → the keyword did NOT fire.
    expect(result.chatInjections?.map((i) => i.content)).not.toContain("DRAGON LORE");
  });
});

describe("buildAssembleContext — WORLD_INFO regex runs through the watchdog (D53)", () => {
  test("a throwing watchdog skips the WORLD_INFO script (the entry content is unchanged)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "GOLD hoard" }); // always-scope, always fires
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      regexScripts: [regexScript("w", "GOLD", "SILVER", "WORLD_INFO")],
    };
    // The injected watchdog THROWS → the kit executor's per-script try/catch skips it → "GOLD" survives. The
    // default native replace would have produced "SILVER", so the unchanged content proves the seam was used.
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      applyRegexReplace: () => {
        throw new Error("timed out");
      },
    });
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
    });
    expect(out.worldInfoBefore).toContain("GOLD hoard");
  });
});

describe("buildAssembleContext — guided steering (chat.md §6, PD-63)", () => {
  test("system placement (the default): the action template resolves to ctx.guidedInstruction — template macros live, untrusted {{input}} neutralized", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      guidedActions: {
        ...DEFAULT_GUIDED_ACTIONS,
        response: { prompt: "[Steer for {{char}}: {{input}}]", role: "system" as const },
      },
    };
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      guided: { action: "response", input: "watch the {{tone}} closely" },
    });
    // Template macros resolve ({{char}} → the cast primary); the user's steering text is spliced in with
    // its braces ZWSP-neutralized (a typed {{tone}} can NEVER re-trigger macro evaluation).
    expect(out.guidedInstruction).toBe(
      `[Steer for Aria: watch the {${ZWSP}{tone}${ZWSP}} closely]`,
    );
    // System placement adds NO injection.
    expect(out.chatInjections?.some((i) => i.content.includes("watch the"))).toBe(false);
  });

  test("inject placement: a depth-0 in_chat injection with the CHOSEN role (never pinned); no marker text", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: {
        action: "response",
        input: "be brief",
        placement: { kind: "inject", role: "assistant" },
      },
    });
    const guided = out.chatInjections?.find((i) => i.content.includes("be brief"));
    expect(guided).toMatchObject({ position: "in_chat", depth: 0, role: "assistant" });
    expect(out.guidedInstruction).toBeUndefined();
  });

  test("the per-action config role decides the DEFAULT placement (role:user → a depth-0 user injection)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      guidedActions: {
        ...DEFAULT_GUIDED_ACTIONS,
        impersonate: { prompt: "[As {{user}}: {{input}}]", role: "user" as const },
      },
    };
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      guided: { action: "impersonate", input: "storm out" },
    });
    const guided = out.chatInjections?.find((i) => i.content.includes("storm out"));
    expect(guided).toMatchObject({ position: "in_chat", depth: 0, role: "user" });
    expect(out.guidedInstruction).toBeUndefined();
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

describe("buildAssembleContext — the null-anchor fallback (dual-persona rule)", () => {
  const alice = { name: "Alice", description: "a bold captain" };
  const bob = { name: "Bob", description: "a quiet scholar" };

  test("no anchor: the ACTIVE persona anchors card-derived {{user}} (never the literal 'User')", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active: alice },
    });

    // The pinned (card-POV) slot fell back to the active persona — {{user}} in card text is Alice.
    expect(out.pinnedPersona).toEqual(alice);
    expect(out.activePersona).toEqual(alice);
  });

  test("a SET anchor holds (no fallback): card POV stays the anchor while active differs", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: bob, active: alice },
    });

    expect(out.pinnedPersona).toEqual(bob);
    expect(out.activePersona).toEqual(alice);
  });

  test("no personas at all: both slots stay null (the macro layer's 'User' floor is the last resort)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    expect(out.pinnedPersona).toBeNull();
    expect(out.activePersona).toBeNull();
  });
});
