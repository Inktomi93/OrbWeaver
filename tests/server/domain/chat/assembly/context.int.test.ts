// assembly/context — RESOLVE→GATHER→BUILD (chat.md Part II §2/§3/§4/§5). Pins the doc's load-bearing wins:
// keyword-match-sees-PENDING-user-text (§3 rule 4, the two-phase lag-kill), per-entry render-ONCE
// (macro→wiFormat-wrap, §3 rules 1-3), the ONE injection list + ONE budget pass (§4 — lore dropped by
// priority, operator intent spared), WI position routing, and the immutable/pure ctx (§5 — two calls equal).
import type { CharacterCard } from "@orb/contracts/character";
import { cardDepthPromptSchema } from "@orb/contracts/character";
import type { ChatInjection, RoomOverrides } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { chatBooks, worldBooks, worldEntries } from "@orb/db";
import { ZWSP } from "@orb/kit/guided";
import type { CharacterId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { assemblePrompt } from "../../../../../packages/server/src/domain/chat/assembly/assemble";
import { buildAssembleContext } from "../../../../../packages/server/src/domain/chat/assembly/context";
import { spliceInChatInjections } from "../../../../../packages/server/src/domain/chat/assembly/injections";
import { renderMacros } from "../../../../../packages/server/src/domain/chat/assembly/macros";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context";
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
  await db.insert(worldBooks).values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT });
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
  await db.insert(chatBooks).values({ chatId: castId(chatId), worldBookId: bookId, createdAt: FROZEN_AT });
}

interface InputOver {
  pendingUserText?: string;
  recentMessages?: string[];
  userInjections?: ChatInjection[];
  injectionTokenBudget?: number;
  hostTierRegexScripts?: RegexScript[];
  roomOverrides?: RoomOverrides;
  mutedSpeakerKeys?: ReadonlySet<string>;
}
function inputOf(chatId: string, ownerId: UserId, castIds: CharacterId[], over: InputOver = {}): Parameters<typeof buildAssembleContext>[1] {
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
    ...(over.hostTierRegexScripts !== undefined ? { hostTierRegexScripts: over.hostTierRegexScripts } : {}),
    ...(over.roomOverrides !== undefined ? { roomOverrides: over.roomOverrides } : {}),
    ...(over.mutedSpeakerKeys !== undefined ? { mutedSpeakerKeys: over.mutedSpeakerKeys } : {}),
  };
}

/** A fully-defaulted host-tier `RegexScript` (via the parse seam) for the given placement. */
function regexScript(id: string, find: string, replace: string, placement: "USER_INPUT" | "WORLD_INFO"): RegexScript {
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
    const fired = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { pendingUserText: "a dragon appears" }));
    expect(fired.chatInjections?.map((i) => i.content)).toContain("DRAGON LORE");
    expect(fired.wiTrace?.matchedKeys).toContainEqual({
      key: "dragon",
      matchedLatestUserMessage: true,
    });
    // D50 pt-2: the fired entry's real id lands in the trace `worldInfoActivated` reads.
    expect(fired.wiTrace?.activated).toEqual([{ id: castId<WorldEntryId>("world_entry_k"), keys: ["dragon"] }]);

    // No pending text + not in the recent window → does NOT fire (keyword gate holds).
    const quiet = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    expect(quiet.chatInjections?.map((i) => i.content)).not.toContain("DRAGON LORE");
    expect(quiet.wiTrace?.activated).toEqual([]);
  });

  test("a keyword entry fires on a COMMITTED recent message (the haystack spans the recent window, not just the in-flight turn)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    // The key appears in a prior committed turn (no in-flight pending text). buildKeywordHaystack folds
    // recentMessages in → the entry still fires, flagged NOT-latest-user (it wasn't just typed).
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { recentMessages: ["a dragon flew overhead", "the knight fled"] }));
    expect(out.chatInjections?.map((i) => i.content)).toContain("DRAGON LORE");
    expect(out.wiTrace?.matchedKeys).toContainEqual({ key: "dragon", matchedLatestUserMessage: false });
    expect(out.wiTrace?.activated).toEqual([{ id: castId<WorldEntryId>("world_entry_k"), keys: ["dragon"] }]);
  });

  // F4 (§6 item 5): the guided steer text joins the WI keyword haystack (source `scan=true`). A generate/
  // swipe/continue turn carries no pendingUserText, so before this the steer contributed nothing to lore.
  test("F4: a guided steer keyword WAKES a keyword-scoped WI entry (no pending user text)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    // No pendingUserText, no recent window mentioning it — ONLY the steer says "dragon". The entry fires.
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", input: "have the dragon attack" },
    });
    expect(out.chatInjections?.map((i) => i.content)).toContain("DRAGON LORE");
    expect(out.wiTrace?.matchedKeys).toContainEqual({ key: "dragon", matchedLatestUserMessage: false });
    expect(out.wiTrace?.activated).toEqual([{ id: castId<WorldEntryId>("world_entry_k"), keys: ["dragon"] }]);
  });

  test("F4: steer ABSENT ⇒ the keyword entry stays asleep (the steer is the only thing that would wake it)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    expect(out.chatInjections?.map((i) => i.content)).not.toContain("DRAGON LORE");
    expect(out.wiTrace?.activated).toEqual([]);
  });

  test("F4: a steer with no matching keyword does NOT falsely fire the entry (raw steer input scanned, not the boilerplate template)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", input: "be more terse" },
    });
    expect(out.chatInjections?.map((i) => i.content)).not.toContain("DRAGON LORE");
    expect(out.wiTrace?.activated).toEqual([]);
  });
});

describe("buildAssembleContext — the D50 user_input PromptTransform point (automation-design/04 §1.2/§6)", () => {
  test("a user_input transform runs AFTER the macro pass, BEFORE the USER_INPUT regex (the SEND sink proves order)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "u");
    const charId = await seedCharacter(db, host, "aria");
    // The transform INSERTS "SECRET"; only fires at the user_input point.
    const apply = (point: string, _chatId: unknown, draft: string): Promise<string> => Promise.resolve(point === "user_input" ? `${draft} SECRET` : draft);
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardOf("Aria")), promptTransforms: apply as ChatContext["promptTransforms"] });
    const out: { sendUserText?: string } = {};
    // A USER_INPUT regex that redacts SECRET — it can only bite if the transform (which inserts SECRET) ran first.
    const redact = regexScript("redact", "SECRET", "[redacted]", "USER_INPUT");
    await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { pendingUserText: "hello", hostTierRegexScripts: [redact] }), out);
    expect(out.sendUserText).toBe("hello [redacted]");
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

  test("F3: wiFormat wrap preserves `$$`/`$&` in entry content (function-replacement form)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // Lore carrying `$`-patterns the string form of replaceAll would mangle ($$→$, $&→the matched marker).
    await attachChatEntry(host, chatId, "k", { content: "charges $$50 — use $& tokens" });
    const config = { ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "[Lore: {{entry}}]" } };
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
    });
    // Verbatim: `$$` and `$&` survive rather than collapsing / re-injecting the `{{entry}}` marker.
    expect(out.worldInfoBefore).toContain("[Lore: charges $$50 — use $& tokens]");
  });

  test("F2-sibling: an empty-rendering entry under a CUSTOM wiFormat injects NOTHING (no dangling scaffold)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // The entry renders to empty (a macro with no value); a custom wiFormat would otherwise wrap `""`.
    await attachChatEntry(host, chatId, "k", { content: "{{memory}}" });
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      formatStrings: { wiFormat: "[World info:\n{{entry}}]" },
    };
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
    });
    // No dangling `[World info:\n]` scaffold anywhere, and the entry contributes no injection.
    expect(out.worldInfoBefore).not.toContain("World info:");
    expect((out.chatInjections ?? []).some((i) => i.content.includes("World info:"))).toBe(false);
    expect(out.wiTrace?.activated).toEqual([]);
  });

  test("position routing: always → world_info_before anchor; keyword(fired) → in_prompt; inject → in_chat", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "always", { content: "ALWAYS" });
    await attachChatEntry(host, chatId, "kw", { content: "KW", keys: ["spell"] });
    await attachChatEntry(host, chatId, "depth", { content: "DEPTH", inject: { depth: 2 } });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { pendingUserText: "cast a spell" }));
    const byContent = Object.fromEntries((out.chatInjections ?? []).map((i) => [i.content, i.position]));
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
    const userInjections: ChatInjection[] = [{ position: "in_static", depth: 0, role: "system", content: "OPERATOR" }];
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { userInjections, injectionTokenBudget: 2 }));
    // Always-scope lore routes to the before-anchor; the operator injection stays in the in_static list.
    expect(out.worldInfoBefore).toContain("AAAAAAAA"); // higher priority kept
    expect(out.worldInfoBefore).not.toContain("BBBBBBBB"); // lower priority dropped
    expect((out.chatInjections ?? []).map((i) => i.content)).toContain("OPERATOR"); // spared (ignoreBudget)
    expect(out.wiTrace?.dropped).toContainEqual({ id: "world_entry_lo", reason: "budget" });
    // D50 pt-2: `activated` is the budget-SURVIVED fired set — the kept entry's real id (+ its keys), not the
    // dropped one, and never the synthetic `user:*`/`guided` ids of the operator injection.
    expect(out.wiTrace?.activated).toEqual([{ id: castId<WorldEntryId>("world_entry_hi"), keys: [] }]);
  });

  test("budget <= 0 keeps ALL candidates (unbudgeted pass) — the same set that a positive budget drops survives whole", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // Identical entries to the drop-by-priority case above; at budget 0 BOTH survive (no charge, no drop).
    await attachChatEntry(host, chatId, "hi", { content: "AAAAAAAA", priority: 10 });
    await attachChatEntry(host, chatId, "lo", { content: "BBBBBBBB", priority: 1 });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { injectionTokenBudget: 0 }));

    expect(out.worldInfoBefore).toContain("AAAAAAAA");
    expect(out.worldInfoBefore).toContain("BBBBBBBB");
    expect(out.wiTrace?.dropped).toEqual([]);
    expect(out.wiTrace?.activated).toEqual(
      expect.arrayContaining([
        { id: castId<WorldEntryId>("world_entry_hi"), keys: [] },
        { id: castId<WorldEntryId>("world_entry_lo"), keys: [] },
      ]),
    );
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

  test("no host scripts → the sink carries the frozen composer text (macro-less ⇒ byte-identical passthrough)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out: { sendUserText?: string } = {};
    const result = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { pendingUserText: "a wyrm appears" }), out);
    // #77 freeze-volatile: the SEND path ALWAYS flows the composer text through the freeze pass, so the sink is
    // set even with no host scripts — a macro-less string freezes to itself (the canon-persisted, re-render-stable
    // value the verb writes; Chat-Macro-Resolution §0).
    expect(out.sendUserText).toBe("a wyrm appears");
    // "wyrm" never became "dragon" → the keyword did NOT fire.
    expect(result.chatInjections?.map((i) => i.content)).not.toContain("DRAGON LORE");
  });
});

// ── Character's-Note-@-Depth (card `depthPrompt`) → per-member in_chat injection (the CHARACTER sibling of
//    the persona depth candidate) ────────────────────────────────────────────────────────────────────────
type DepthNote = NonNullable<CharacterCard["depthPrompt"]>;
function cardWithNote(name: string, note: DepthNote | null): CharacterCard {
  return { ...cardOf(name), depthPrompt: note };
}
/** A ChatContext whose getCard maps each characterId → its card (multi-member rooms). */
function ctxWithCards(byId: Record<string, CharacterCard>): ChatContext {
  return makeChatContext(db, {
    getCard: ({ characterId }) => Promise.resolve(byId[characterId] ?? null),
  });
}
/** The in_chat notes filtered by role != undefined would be ambiguous; select by known content instead. */

describe("buildAssembleContext — character depthPrompt (Character's Note @ Depth)", () => {
  test("a solo character's non-empty note injects exactly once as in_chat at its depth/role", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Aria stays cryptic.");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ position: "in_chat", depth: 4, role: "system" });
    expect(out.authorsNoteSource).toBe("from Aria");
  });

  test("a null depthPrompt injects nothing + leaves authorsNoteSource unset", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", null));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    expect(out.chatInjections ?? []).toHaveLength(0);
    expect(out.authorsNoteSource).toBeUndefined();
  });

  test("an empty-prompt note (whitespace-only) injects nothing", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "   ", depth: 4, role: "system" }));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    expect(out.chatInjections ?? []).toHaveLength(0);
    expect(out.authorsNoteSource).toBeUndefined();
  });

  test("an absent role defaults to system", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "no explicit role", depth: 3 }));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    const note = (out.chatInjections ?? []).find((i) => i.content === "no explicit role");
    expect(note).toMatchObject({ position: "in_chat", depth: 3, role: "system" });
  });

  test("{{char}} in each member's note binds to THAT member (per-member render ctx)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({
      [ariaId]: cardWithNote("Aria", {
        prompt: "{{char}} guards a secret.",
        depth: 4,
        role: "system",
      }),
      [branId]: cardWithNote("Bran", { prompt: "{{char}} owes a debt.", depth: 2, role: "user" }),
    });
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [ariaId, branId]));
    const contents = (out.chatInjections ?? []).map((i) => i.content);

    // Each note's {{char}} resolved to its OWN owner, not the cast primary.
    expect(contents).toContain("Aria guards a secret.");
    expect(contents).toContain("Bran owes a debt.");
    const aria = (out.chatInjections ?? []).find((i) => i.content === "Aria guards a secret.");
    const bran = (out.chatInjections ?? []).find((i) => i.content === "Bran owes a debt.");
    expect(aria).toMatchObject({ depth: 4, role: "system" });
    expect(bran).toMatchObject({ depth: 2, role: "user" });
    expect(out.authorsNoteSource).toBe("merged (present cast)");
  });

  test("multiple notes at the SAME depth stack in cast order (primary first in the array)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({
      [ariaId]: cardWithNote("Aria", { prompt: "Aria note.", depth: 4, role: "system" }),
      [branId]: cardWithNote("Bran", { prompt: "Bran note.", depth: 4, role: "system" }),
    });
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [ariaId, branId]));
    const order = (out.chatInjections ?? []).map((i) => i.content);

    // Array order = output order for same-depth in_chat injections (the SHAPE splice is stable on ties):
    // primary (Aria) precedes the member (Bran), so the primary's note lands on top after the splice.
    expect(order.indexOf("Aria note.")).toBeLessThan(order.indexOf("Bran note."));
  });

  test("the note splices into runner history at its depth (SHAPE placement, N from the tail)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    // role:user so the spliced content stays verbatim (system would be [Note from system: …]-framed).
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 2, role: "user" }));
    const built = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));

    const history = [1, 2, 3, 4, 5].map((n) => ({ role: "user" as const, content: `m${n}` }));
    const spliced = spliceInChatInjections(history, built.chatInjections);
    // depth 2 → inserted 2 slots from the tail (index length-2 = 3 in the original 5-msg history).
    expect(spliced).toHaveLength(6);
    expect(spliced.findIndex((m) => m.content.includes("Aria stays cryptic."))).toBe(3);
  });

  test("D66-B: assistant@depth-0 is ACCEPTED at the WRITE boundary; safety moved to the SHAPE delivery gate", () => {
    // The write-reject was REMOVED (W5, ruling A) — authored prefill is persistable. A stored
    // assistant@depth-0 note now round-trips the write schema; the SHAPE splice normalizes it to depth 1
    // (the only assistant placement both runners express) unless the model's `assistantPrefill` is honored.
    expect(cardDepthPromptSchema.safeParse({ prompt: "x", depth: 0, role: "assistant" }).success).toBe(true);
    expect(cardDepthPromptSchema.safeParse({ prompt: "x", depth: 1, role: "assistant" }).success).toBe(true);
  });
});

// ── the muted-cast subset (`castNotMuted` → `{{groupNotMuted}}`, R1/F1): a muted seat (character OR agent)
//    stays in `cast` for its lore/soul but drops from the non-muted subset, keyed on the same seat `disabled`
//    axis `loadRoom` derives `mutedSpeakerKeys` from. `{{group}}` renders all; `{{groupNotMuted}}` the survivors.
describe("buildAssembleContext — castNotMuted / {{groupNotMuted}} (R1/F1)", () => {
  test("a muted character drops from castNotMuted / {{groupNotMuted}} but stays in cast / {{group}}", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({ [ariaId]: cardOf("Aria"), [branId]: cardOf("Bran") });
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [ariaId, branId], { mutedSpeakerKeys: new Set([speakerKey({ kind: "character", characterId: branId })]) }),
    );

    expect((out.cast ?? []).map((c) => c.name)).toEqual(["Aria", "Bran"]);
    expect((out.castNotMuted ?? []).map((c) => c.name)).toEqual(["Aria"]);
    expect(renderMacros("{{group}}", out, null)).toBe("Aria, Bran");
    expect(renderMacros("{{groupNotMuted}}", out, null)).toBe("Aria");
  });

  test("no muted seats ⇒ castNotMuted equals the full cast (byte-identical fallback)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({ [ariaId]: cardOf("Aria"), [branId]: cardOf("Bran") });
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [ariaId, branId]));

    expect((out.castNotMuted ?? []).map((c) => c.name)).toEqual(["Aria", "Bran"]);
    expect(renderMacros("{{groupNotMuted}}", out, null)).toBe(renderMacros("{{group}}", out, null));
  });
});

// ── The RETIRED room author's note (owner ruling 2026-08-01). `roomOverrides.authorsNote` was a SECOND
//    producer of the same at-depth splice `chat_injections` already owns, so the arm was deleted: the
//    per-chat note is now just an injection (system @ depth 4 IS the author's note). These pin that the
//    branch is GONE — a room note can no longer suppress the cast's card notes, and the surviving door
//    lands at the identical position. ───────────────────────────────────────────────────────────────────
describe("buildAssembleContext — the room author's-note override is GONE (owner ruling 2026-08-01)", () => {
  test("a chat injection at depth 4 / system IS the author's note — same position, budget-exempt", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", null));
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        userInjections: [{ position: "in_chat", depth: 4, role: "system", content: "Keep it tense.", origin: "user" }],
      }),
    );

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Keep it tense.");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ position: "in_chat", depth: 4, role: "system" });
    // No override arm survives to claim the trace slot — the label names CARD contributors only.
    expect(out.authorsNoteSource).toBeUndefined();
  });

  test("room overrides no longer suppress the cast's card notes (the deleted branch)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const cards = {
      [ariaId]: cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }),
      [branId]: cardWithNote("Bran", { prompt: "Bran owes a debt.", depth: 2, role: "system" }),
    };
    const out = await buildAssembleContext(
      ctxWithCards(cards),
      inputOf(chatId, host, [ariaId, branId], {
        roomOverrides: { scenario: "a quiet tavern" },
        userInjections: [{ position: "in_chat", depth: 4, role: "system", content: "The chat note.", origin: "user" }],
      }),
    );
    const contents = (out.chatInjections ?? []).map((i) => i.content);

    // The chat-level note and BOTH card notes coexist — nothing suppresses anything.
    expect(contents).toContain("The chat note.");
    expect(contents).toContain("Aria stays cryptic.");
    expect(contents).toContain("Bran owes a debt.");
    expect(out.authorsNoteSource).toBe("merged (present cast)");
  });

  test("REGRESSION PIN: a set room override leaves the card notes byte-identical to the bare build", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const cards = {
      [ariaId]: cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }),
      [branId]: cardWithNote("Bran", { prompt: "Bran owes a debt.", depth: 2, role: "user" }),
    };
    const bare = await buildAssembleContext(ctxWithCards(cards), inputOf(chatId, host, [ariaId, branId]));
    const withOverride = await buildAssembleContext(
      ctxWithCards(cards),
      inputOf(chatId, host, [ariaId, branId], { roomOverrides: { scenario: "a quiet tavern" } }),
    );

    expect(withOverride.chatInjections).toStrictEqual(bare.chatInjections);
    expect(withOverride.authorsNoteSource).toBe(bare.authorsNoteSource);
    expect(bare.authorsNoteSource).toBe("merged (present cast)");
  });
});

describe("buildAssembleContext — WORLD_INFO regex runs through the watchdog (D53)", () => {
  test("a throwing watchdog skips the WORLD_INFO script (the entry content is unchanged)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "GOLD hoard" }); // always-scope, always fires
    // The injected watchdog THROWS → the kit executor's per-script try/catch skips it → "GOLD" survives. The
    // default native replace would have produced "SILVER", so the unchanged content proves the seam was used.
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      applyRegexReplace: () => {
        throw new Error("timed out");
      },
    });
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { hostTierRegexScripts: [regexScript("w", "GOLD", "SILVER", "WORLD_INFO")] }));
    expect(out.worldInfoBefore).toContain("GOLD hoard");
  });
});

// F2: the WORLD_INFO leg read `promptConfig.regexScripts` — the PRESET slice — while every other shared leg
// (USER_INPUT here, AI_OUTPUT/REASONING in engine/pipeline) runs the RESOLVED host-tier union (D53:
// host-global ∪ chat-preset ∪ present cast, `substrate/regex-tier`). A host-global or card script whose
// placement includes WORLD_INFO (the settings default placement set INCLUDES it) therefore never fired.
describe("buildAssembleContext — the WORLD_INFO leg runs the RESOLVED host-tier union (F2, D53)", () => {
  test("a host-tier WORLD_INFO script rewrites the entry content", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "GOLD hoard" }); // always-scope, always fires
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { hostTierRegexScripts: [regexScript("w", "GOLD", "SILVER", "WORLD_INFO")] }));
    expect(out.worldInfoBefore).toContain("SILVER hoard");
    expect(out.worldInfoBefore).not.toContain("GOLD");
  });

  test("the raw preset field is NOT a second source — only the resolved union feeds the leg", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "GOLD hoard" });
    const ctx = ctxWithCard(cardOf("Aria"));

    // `assemble-gather` folds `promptConfig.regexScripts` INTO the union (the `preset` source), so a real turn
    // loses nothing; reading the field here too would be a second, differently-ordered source of the same set.
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: { ...DEFAULT_PROMPT_CONFIG, regexScripts: [regexScript("w", "GOLD", "SILVER", "WORLD_INFO")] },
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
    expect(out.guidedInstruction).toBe(`[Steer for Aria: watch the {${ZWSP}{tone}${ZWSP}} closely]`);
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

  // P5 — the wand's one-shot GAME steers (`guided.gameSteer`): the kit template resolves through the
  // macro engine (rpg data macros read the gather feed) and lands as ONE depth-0 SYSTEM injection —
  // the ephemeral channel; `input` and the preset action config are ignored by design.
  test("P5 gameSteer twist: the kit template resolves rpg macros from the gather feed → depth-0 system injection; input ignored", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      rpgMacros: { rpgSceneState: "Scene: the tavern", rpgQuests: "- Find the bone key" },
      guided: { action: "response", input: "MUST-NOT-APPEAR", gameSteer: "twist" },
    });
    const steer = out.chatInjections?.find((i) => i.content.includes("complication"));
    expect(steer).toMatchObject({ position: "in_chat", depth: 0, role: "system" });
    // The template's {{rpgSceneState}}/{{rpgQuests}} resolved against the staged feed (live state).
    expect(steer?.content).toContain("the tavern");
    expect(steer?.content).toContain("Find the bone key");
    // `input` is IGNORED on the gameSteer arm (the wire carries only the enum kind).
    expect(steer?.content).not.toContain("MUST-NOT-APPEAR");
    // Never the marker channel — the game steer is an ephemeral injection, not the preset's guided slot.
    expect(out.guidedInstruction).toBeUndefined();
  });

  test("P5 gameSteer choices: the one-shot 'Offer choices' steer teaches the :::choices fence for THIS turn", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", gameSteer: "choices" },
    });
    const steer = out.chatInjections?.find((i) => i.content.includes(":::choices"));
    expect(steer).toMatchObject({ position: "in_chat", depth: 0, role: "system" });
    expect(out.guidedInstruction).toBeUndefined();
  });

  test("F2: a scaffold-only action (response) with a BLANK steer injects NOTHING (no dangling scaffold)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", input: "" },
    });
    // Neither arm fires: no `{{guided_instruction}}` value and no depth-0 guided injection.
    expect(out.guidedInstruction).toBeUndefined();
    expect(out.chatInjections?.some((i) => i.content.includes("special consideration"))).toBe(false);
  });

  test("F2: a standalone action (impersonate) with a BLANK steer STILL fires unsteered", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "impersonate", input: "" },
    });
    // The default impersonate template carries a standalone instruction (role system → the marker value).
    expect(out.guidedInstruction).toBeDefined();
    expect(out.guidedInstruction?.length ?? 0).toBeGreaterThan(0);
  });

  // §10 addendum / F8: a system-placement steer against a preset with NO `guided_instruction` marker used
  // to land NOWHERE (the marker never renders `ctx.guidedInstruction`). Now it falls back to a depth-0
  // injection on the same ChatInjection channel + flips the loud-warning flag the engine reads.
  test("F8: marker PRESENT (default) — system steer still lands via ctx.guidedInstruction, NO fallback, NO injection", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", input: "be brief" },
    });
    expect(out.guidedInstruction).toBeDefined();
    expect(out.guidedPlacedAsInjection).not.toBe(true);
    expect(out.chatInjections?.some((i) => i.content.includes("be brief"))).toBe(false);
  });

  test("F8: marker ABSENT — a system steer FALLS BACK to a depth-0 system injection + flags the loud warning (never vanishes)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    // Strip the guided_instruction marker from the preset — the config-editor's "no marker" case.
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      sections: DEFAULT_PROMPT_CONFIG.sections.filter((s) => !(s.type === "marker" && s.marker === "guided_instruction")),
    };
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      guided: { action: "response", input: "be brief" },
    });
    // The marker home is gone, so nothing is staged there…
    expect(out.guidedInstruction).toBeUndefined();
    // …instead the resolved steer rides a depth-0 SYSTEM injection (the convergence channel).
    const guided = out.chatInjections?.find((i) => i.content.includes("be brief"));
    expect(guided).toMatchObject({ position: "in_chat", depth: 0, role: "system" });
    // …and the loud-warning signal is set (the engine emits `guided_placed_as_injection` off this).
    expect(out.guidedPlacedAsInjection).toBe(true);
  });

  test("F8: marker DISABLED (present but off) — same fallback as absent", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const config = {
      ...DEFAULT_PROMPT_CONFIG,
      sections: DEFAULT_PROMPT_CONFIG.sections.map((s) => (s.type === "marker" && s.marker === "guided_instruction" ? { ...s, enabled: false } : s)),
    };
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: config,
      guided: { action: "response", input: "be brief" },
    });
    expect(out.guidedInstruction).toBeUndefined();
    expect(out.chatInjections?.find((i) => i.content.includes("be brief"))).toMatchObject({ position: "in_chat", depth: 0, role: "system" });
    expect(out.guidedPlacedAsInjection).toBe(true);
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

describe("buildAssembleContext — persona description placement (FINAL-Persona §A.6b gap #1)", () => {
  test("at_depth: the ACTIVE persona's description rides an in_chat ChatInjection; the {{persona}} marker is silenced", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "at_depth", depth: 3, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });

    const injected = (out.chatInjections ?? []).find((i) => i.content === "a wandering scholar");
    expect(injected).toMatchObject({ position: "in_chat", depth: 3, role: "system" });
    // The single-placement rule: at_depth SILENCES the {{persona}} marker so it can't ALSO emit.
    expect(out.personaMarkerActive).toBe(false);
  });

  test("in_prompt (the default): no ChatInjection is emitted — the description rides {{persona}} only", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "in_prompt" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });

    expect(out.chatInjections ?? []).toEqual([]);
    // {{persona}} still resolves off the SAME AssemblePersona (macros.test.ts pins the macro-layer half).
    expect(out.activePersona?.description).toBe("a wandering scholar");
    // in_prompt ⇒ the marker EMITS the description (the prompt slot).
    expect(out.personaMarkerActive).toBe(true);
  });

  test("none: no ChatInjection is emitted AND the {{persona}} marker is silenced (ST opt-out)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "none" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });

    expect(out.chatInjections ?? []).toEqual([]);
    expect(out.personaMarkerActive).toBe(false);
  });

  test("no placement set (a fixture/legacy caller): degrades to the in_prompt no-op (marker emits, no injection)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = { name: "Nyx", description: "a wandering scholar" };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });

    expect(out.chatInjections ?? []).toEqual([]);
    expect(out.personaMarkerActive).toBe(true);
  });

  // The single-placement rule proven END-TO-END through assemblePrompt: at_depth must not ALSO surface in
  // the system prompt via the {{persona}} marker (the default preset ships an enabled persona marker).
  test("at_depth does NOT double-emit: the description is absent from the assembled system prompt", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "at_depth", depth: 2, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });
    const prompt = assemblePrompt(DEFAULT_PROMPT_CONFIG, out);
    // The description rode the in_chat injection (SHAPE splices it), so the marker-driven system halves omit it.
    expect(`${prompt.static}\n${prompt.dynamic}`).not.toContain("a wandering scholar");
  });

  test("in_prompt DOES emit the description via the {{persona}} marker in the assembled system prompt", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "in_prompt" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });
    const prompt = assemblePrompt(DEFAULT_PROMPT_CONFIG, out);
    expect(`${prompt.static}\n${prompt.dynamic}`).toContain("a wandering scholar");
  });
});

describe("buildAssembleContext — the BOTH-PERSONAS context rule on a swap (FINAL-Persona §A.6b gap #1)", () => {
  test("no swap (anchor == active): ONE injection, byte-identical to the solo (anchor-null) output", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const active = {
      name: "Nyx",
      description: "a wandering scholar",
      placement: { kind: "at_depth", depth: 3, role: "system" } as const,
    };

    const solo = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: null, active },
    });
    // anchor is the SAME persona (a fresh structurally-equal projection, as loadPersona would produce).
    const noSwap = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor: { ...active }, active },
    });

    // The solo invariant: the anchor adds NOTHING when it is the active persona.
    expect(noSwap.chatInjections).toEqual(solo.chatInjections);
    expect(noSwap.personaMarkerActive).toBe(solo.personaMarkerActive);
    expect((noSwap.chatInjections ?? []).length).toBe(1);
  });

  test("swap: ACTIVE injects per its own config (in_chat), ANCHOR injects in card-context (in_static, framed)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const anchor = {
      name: "Alex",
      description: "Alex is a knight",
      placement: { kind: "in_prompt" } as const,
    };
    const active = {
      name: "Steve",
      description: "Steve is a mage",
      placement: { kind: "at_depth", depth: 2, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor, active },
    });
    const injections = out.chatInjections ?? [];

    // ACTIVE (prompt-context) — its own at_depth config, UNFRAMED.
    const activeInj = injections.find((i) => i.position === "in_chat");
    expect(activeInj?.content).toBe("Steve is a mage");
    expect(activeInj).toMatchObject({ depth: 2, role: "system" });
    expect(activeInj?.content).not.toContain("The person the character knows");

    // ANCHOR (card-context) — a FIXED in_static system block, framed as the established identity.
    const anchorInj = injections.find((i) => i.position === "in_static");
    expect(anchorInj).toMatchObject({ position: "in_static", role: "system" });
    expect(anchorInj?.content).toContain("Alex is a knight");
    expect(anchorInj?.content).toContain("The person the character knows as the user is Alex");
  });

  // PROSE-1 census 74 — the lead-in clause is a per-USER slot resolved against the ROOM HOST through
  // `ctx.resolveChatProse`; the brackets, the name and the description stay the injection's grammar.
  test("swap: a host override REPLACES the anchor identity lead-in, keeping the name/description frame", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(cardOf("Aria")),
      resolveChatProse: () => Promise.resolve({ "chat.assembly.anchorIdentity": { text: "Your operator is", baseVersion: 1 } }),
    });

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: {
        anchor: { name: "Alex", description: "Alex is a knight", placement: { kind: "in_prompt" } as const },
        active: { name: "Steve", description: "Steve is a mage", placement: { kind: "at_depth", depth: 2, role: "system" } as const },
      },
    });

    const anchorInj = (out.chatInjections ?? []).find((i) => i.position === "in_static");
    expect(anchorInj?.content).toBe("[Your operator is Alex: Alex is a knight]");
  });

  // The host's prose must reach the DOWNSTREAM stages too (the merged co-speaker headings in the BUILD walk,
  // the note frames in the SHAPE splice, the round nudge in the driver) — all of which read it off the ONE
  // immutable ctx rather than re-resolving the host. This pins the carry + the system-block frame together.
  test("the resolved host prose is CARRIED on the ctx, and already frames the system-block injections", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const prose = { "chat.injection.userNote": { text: "((table note: {{note}}))", baseVersion: 1 } };
    const ctx = makeChatContext(db, { getCard: () => Promise.resolve(cardOf("Aria")), resolveChatProse: () => Promise.resolve(prose) });

    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        userInjections: [{ position: "in_prompt", depth: 0, role: "user", content: "keep it short" }],
        injectionTokenBudget: 64,
      }),
    );

    expect(out.prose).toStrictEqual(prose);
    const framed = (out.chatInjections ?? []).find((i) => i.position === "in_prompt");
    expect(framed?.content).toBe("((table note: keep it short))");
  });

  test("swap with anchor descriptionPosition='none': the anchor is NOT injected in either role", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const anchor = {
      name: "Alex",
      description: "Alex is a knight",
      placement: { kind: "none" } as const,
    };
    const active = {
      name: "Steve",
      description: "Steve is a mage",
      placement: { kind: "at_depth", depth: 2, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor, active },
    });
    const injections = out.chatInjections ?? [];

    // The active still injects; the anchor opted out ⇒ no in_static card block.
    expect(injections.some((i) => i.position === "in_chat" && i.content === "Steve is a mage")).toBe(true);
    expect(injections.some((i) => i.position === "in_static")).toBe(false);
  });

  test("each description resolves {{user}} against ITS OWN persona (no cross-contamination)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const anchor = {
      name: "Alex",
      description: "{{user}} is a doctor",
      placement: { kind: "in_prompt" } as const,
    };
    const active = {
      name: "Steve",
      description: "{{user}} is a soldier",
      placement: { kind: "at_depth", depth: 2, role: "system" } as const,
    };

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      personas: { anchor, active },
    });
    const allContent = (out.chatInjections ?? []).map((i) => i.content).join(" || ");

    expect(allContent).toContain("Alex is a doctor"); // anchor desc resolved against Alex
    expect(allContent).toContain("Steve is a soldier"); // active desc resolved against Steve
    // The owner-flagged cross-contamination bug MUST NOT happen:
    expect(allContent).not.toContain("Steve is a doctor");
    expect(allContent).not.toContain("Alex is a soldier");
  });
});

// ── G10: the guided action's own delivery DEPTH (redesign §5.0 — depth is a delivery property) ─────
describe("buildAssembleContext — guided delivery depth (G10)", () => {
  test("an action's `depth` rides its in_chat injection; absent stays the tail (byte-identical)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const withDepth = {
      ...DEFAULT_PROMPT_CONFIG,
      guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "[Steer: {{input}}]", role: "user" as const, depth: 4 } },
    };

    const deep = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: withDepth,
      guided: { action: "response", input: "be brief" },
    });
    expect(deep.chatInjections?.find((i) => i.content.includes("be brief"))).toMatchObject({ position: "in_chat", depth: 4, role: "user" });

    const noDepth = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      promptConfig: { ...withDepth, guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "[Steer: {{input}}]", role: "user" as const } } },
      guided: { action: "response", input: "be brief" },
    });
    expect(noDepth.chatInjections?.find((i) => i.content.includes("be brief"))?.depth).toBe(0);
  });
});

// ── G9: the new-chat boundary marker (`formatStrings.newChatMarker`) ───────────────────────────────
describe("buildAssembleContext — the new-chat marker (G9)", () => {
  test("BLANK (the shipped default) emits NOTHING — byte-identical to every pre-G9 turn", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const out = await buildAssembleContext(ctxWithCard(cardOf("Aria")), inputOf(chatId, host, [charId]));
    expect(out.chatInjections?.some((i) => i.origin === "new-chat-marker")).toBe(false);
  });

  test("SET: one system injection at the TOP of the history, with its macros resolved", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const out = await buildAssembleContext(ctxWithCard(cardOf("Aria")), {
      ...inputOf(chatId, host, [charId]),
      promptConfig: { ...DEFAULT_PROMPT_CONFIG, formatStrings: { newChatMarker: "[Start of the chat with {{char}}.]" } },
    });
    const marker = out.chatInjections?.find((i) => i.origin === "new-chat-marker");
    // MAX_SAFE_INTEGER is "the top of the history" — the SHAPE splice clamps it to the history length.
    expect(marker).toMatchObject({ position: "in_chat", depth: Number.MAX_SAFE_INTEGER, role: "system" });
    expect(marker?.content).toBe("[Start of the chat with Aria.]");
  });

  test("a marker that resolves to whitespace emits nothing (no dangling scaffold)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const out = await buildAssembleContext(ctxWithCard(cardOf("Aria")), {
      ...inputOf(chatId, host, [charId]),
      promptConfig: { ...DEFAULT_PROMPT_CONFIG, formatStrings: { newChatMarker: "   " } },
    });
    expect(out.chatInjections?.some((i) => i.origin === "new-chat-marker")).toBe(false);
  });
});
