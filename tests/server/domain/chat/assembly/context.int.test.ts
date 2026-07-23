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
import type { AgentCastMember } from "../../../../../packages/server/src/domain/chat/contract/context";
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
  agentCast?: AgentCastMember[];
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
    ...(over.agentCast !== undefined ? { agentCast: over.agentCast } : {}),
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
    expect(fired.wiTrace?.entryIds).toEqual([castId<WorldEntryId>("world_entry_k")]);

    // No pending text + not in the recent window → does NOT fire (keyword gate holds).
    const quiet = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    expect(quiet.chatInjections?.map((i) => i.content)).not.toContain("DRAGON LORE");
    expect(quiet.wiTrace?.entryIds).toEqual([]);
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
    expect(out.wiTrace?.entryIds).toEqual([]);
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
    // D50 pt-2: `entryIds` is the budget-SURVIVED fired set — the kept entry's real id, not the dropped one,
    // and never the synthetic `user:*`/`guided` ids of the operator injection.
    expect(out.wiTrace?.entryIds).toEqual([castId<WorldEntryId>("world_entry_hi")]);
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

  test("a seated agent voices via the assemble cast but is ABSENT from {{group}} AND {{groupNotMuted}} (owner ruling)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCards({ [ariaId]: cardOf("Aria") });
    const agentUserId = castId<UserId>("agent_pip");
    const agentCast: AgentCastMember[] = [{ userId: agentUserId, identity: { displayName: "Pip", systemPrompt: "", avatarAssetId: null } }];
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [ariaId], { agentCast }));

    // Voice plane: the agent's soul still assembles as a cast card (index-aligned after the characters).
    expect((out.cast ?? []).map((c) => c.name)).toEqual(["Aria", "Pip"]);
    expect((out.castMembers ?? []).map((m) => m.kind)).toEqual(["character", "agent"]);
    // Macro feed: character-only — Pip appears in NEITHER group macro.
    expect((out.castNotMuted ?? []).map((c) => c.name)).toEqual(["Aria"]);
    expect(renderMacros("{{group}}", out, null)).toBe("Aria");
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

// ── ROOM author's note (`roomOverrides.authorsNote`) → the ONE author's-note depth injection (task #18
//    owner ruling, 2026-07-09): a non-empty room note OVERRIDES + SUPPRESSES the member card notes; unset ⇒
//    the member notes flow unchanged (the regression pin). The note is now the shared `{prompt, depth?, role?}`
//    injection directive (task #22): a host-set depth/role flows through `resolveInjectionPlacement`; an unset
//    field falls back to the house default depth 4 / role system. ─────────────────────────────────────────
describe("buildAssembleContext — room author's note (roomOverrides.authorsNote, task #18)", () => {
  test("a non-empty room note injects once at the house depth 4 / role system + source 'room override'", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", null));
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        roomOverrides: { authorsNote: { prompt: "Keep it tense." } },
      }),
    );

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Keep it tense.");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ position: "in_chat", depth: 4, role: "system" });
    expect(out.authorsNoteSource).toBe("room override");
  });

  test("a host-set depth/role on the directive flows through (task #22 — depth 1 / role user)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", null));
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        roomOverrides: { authorsNote: { prompt: "Whisper it.", depth: 1, role: "user" } },
      }),
    );

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Whisper it.");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ position: "in_chat", depth: 1, role: "user" });
    expect(out.authorsNoteSource).toBe("room override");
  });

  test("a partial directive falls back per-field (depth set, role unset ⇒ default role system)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", null));
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        roomOverrides: { authorsNote: { prompt: "Depth only.", depth: 9 } },
      }),
    );

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Depth only.");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ position: "in_chat", depth: 9, role: "system" });
  });

  test("the room note SUPPRESSES the per-member card notes (override-suppresses, no doubling)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({
      [ariaId]: cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }),
      [branId]: cardWithNote("Bran", { prompt: "Bran owes a debt.", depth: 2, role: "system" }),
    });
    const out = await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [ariaId, branId], {
        roomOverrides: { authorsNote: { prompt: "The room note wins." } },
      }),
    );
    const contents = (out.chatInjections ?? []).map((i) => i.content);

    expect(contents).toContain("The room note wins.");
    expect(contents).not.toContain("Aria stays cryptic.");
    expect(contents).not.toContain("Bran owes a debt.");
    expect(out.authorsNoteSource).toBe("room override");
  });

  test("an empty-string room note is treated as unset — member notes flow unchanged", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { roomOverrides: { authorsNote: { prompt: "" } } }));

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Aria stays cryptic.");
    expect(notes).toHaveLength(1);
    expect(out.authorsNoteSource).toBe("from Aria");
  });

  test("a whitespace-only room note is treated as unset — member notes flow unchanged", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { roomOverrides: { authorsNote: { prompt: "   " } } }));

    const notes = (out.chatInjections ?? []).filter((i) => i.content === "Aria stays cryptic.");
    expect(notes).toHaveLength(1);
    expect(out.authorsNoteSource).toBe("from Aria");
  });

  test("REGRESSION PIN: no roomOverrides ⇒ member notes are byte-identical to the no-room-note build", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const cards = {
      [ariaId]: cardWithNote("Aria", { prompt: "Aria stays cryptic.", depth: 4, role: "system" }),
      [branId]: cardWithNote("Bran", { prompt: "Bran owes a debt.", depth: 2, role: "user" }),
    };
    const bare = await buildAssembleContext(ctxWithCards(cards), inputOf(chatId, host, [ariaId, branId]));
    const emptyRoom = await buildAssembleContext(ctxWithCards(cards), inputOf(chatId, host, [ariaId, branId], { roomOverrides: {} }));

    expect(emptyRoom.chatInjections).toStrictEqual(bare.chatInjections);
    expect(emptyRoom.authorsNoteSource).toBe(bare.authorsNoteSource);
    expect(bare.authorsNoteSource).toBe("merged (present cast)");
  });

  test("{{char}} routes to the base primary + {{user}} to the active persona (room-override axis)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const ariaId = await seedCharacter(db, host, "aria");
    const branId = await seedCharacter(db, host, "bran");
    const ctx = ctxWithCards({
      [ariaId]: cardWithNote("Aria", null),
      [branId]: cardWithNote("Bran", null),
    });
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [ariaId, branId], {
        roomOverrides: { authorsNote: { prompt: "{{char}} listens as {{user}} speaks." } },
      }),
      personas: { anchor: null, active: { name: "Nomi", description: "the traveller" } },
    });

    // {{char}} → the base primary (Aria, cast[0]); {{user}} → the active persona (Nomi), matching the
    // host-room-override axis (assemble.ts renders room overrides against the ACTIVE persona).
    const note = (out.chatInjections ?? []).find((i) => i.content.startsWith("Aria listens"));
    expect(note?.content).toBe("Aria listens as Nomi speaks.");
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
