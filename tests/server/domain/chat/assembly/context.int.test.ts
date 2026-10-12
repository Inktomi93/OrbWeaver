// assembly/context — RESOLVE→GATHER→BUILD: the keyword match sees the PENDING user text, each entry renders once, the ONE injection list and budget pass,
// WI position routing and the USER_INPUT regex (the chat design doc Part II §2/§3/§4).

import type { ChatInjection, PromptTransformResult } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, promptConfigSchema } from "@orb/contracts/preset";
import type { Handle, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { makeChatContext, seedCharacter, seedChat, seedUser } from "../_support.ts";
import type { ChatContext } from "./_context-support.ts";
import { attachChatEntry, buildAssembleContext, cardOf, ctxWithCard, db, inputOf, regexScript } from "./_context-support.ts";

describe("buildAssembleContext — GATHER keyword match (the two-phase lag-kill)", () => {
  test("a keyword entry fires on the PENDING user text (same turn), not one turn later", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    // Pending text mentions the key → fires THIS turn, flagged as a latest-user match.
    const fired = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { pendingUserText: "a dragon appears" }));
    expect(fired.worldInfoBeforeDynamic ?? "").toContain("DRAGON LORE");
    expect(fired.wiTrace?.matchedKeys).toContainEqual({
      key: "dragon",
      matchedLatestUserMessage: true,
    });
    // D50 pt-2: the fired entry's real id lands in the trace `worldInfoActivated` reads.
    expect(fired.wiTrace?.activated).toEqual([{ id: castId<WorldEntryId>("world_entry_k"), title: "k", keys: ["dragon"] }]);

    // No pending text + not in the recent window → does NOT fire (keyword gate holds).
    const quiet = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    expect(quiet.worldInfoBeforeDynamic ?? "").not.toContain("DRAGON LORE");
    expect(quiet.wiTrace?.activated).toEqual([]);
  });

  test("a keyword entry fires on a COMMITTED recent message (the haystack spans the recent window, not just the in-flight turn)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    // The key appears in a prior committed turn (no in-flight pending text). buildKeywordHaystack folds
    // recentMessages in → the entry still fires, flagged NOT-latest-user (it wasn't just typed).
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { recentMessages: ["a dragon flew overhead", "the knight fled"] }));
    expect(out.worldInfoBeforeDynamic ?? "").toContain("DRAGON LORE");
    expect(out.wiTrace?.matchedKeys).toContainEqual({ key: "dragon", matchedLatestUserMessage: false });
    expect(out.wiTrace?.activated).toEqual([{ id: castId<WorldEntryId>("world_entry_k"), title: "k", keys: ["dragon"] }]);
  });

  // F4 (§6 item 5): the guided steer text joins the WI keyword haystack (source `scan=true`). A generate/
  // swipe/continue turn carries no pendingUserText, so before this the steer contributed nothing to lore.
  test("F4: a guided steer keyword WAKES a keyword-scoped WI entry (no pending user text)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    // No pendingUserText, no recent window mentioning it — ONLY the steer says "dragon". The entry fires.
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", input: "have the dragon attack" },
    });
    expect(out.worldInfoBeforeDynamic ?? "").toContain("DRAGON LORE");
    expect(out.wiTrace?.matchedKeys).toContainEqual({ key: "dragon", matchedLatestUserMessage: false });
    expect(out.wiTrace?.activated).toEqual([{ id: castId<WorldEntryId>("world_entry_k"), title: "k", keys: ["dragon"] }]);
  });

  test("F4: steer ABSENT ⇒ the keyword entry stays asleep (the steer is the only thing that would wake it)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId]));
    expect(out.worldInfoBeforeDynamic ?? "").not.toContain("DRAGON LORE");
    expect(out.wiTrace?.activated).toEqual([]);
  });

  test("F4: a steer with no matching keyword does NOT falsely fire the entry (raw steer input scanned, not the boilerplate template)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "k", { content: "DRAGON LORE", keys: ["dragon"] });
    const ctx = ctxWithCard(cardOf("Aria"));

    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId]),
      guided: { action: "response", input: "be more terse" },
    });
    expect(out.worldInfoBeforeDynamic ?? "").not.toContain("DRAGON LORE");
    expect(out.wiTrace?.activated).toEqual([]);
  });
});

describe("buildAssembleContext — the D50 user_input PromptTransform point", () => {
  test("a user_input transform runs AFTER the macro pass, BEFORE the USER_INPUT regex (the SEND sink proves order)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "u");
    const charId = await seedCharacter(db, host, "aria");
    // The transform INSERTS "SECRET"; only fires at the user_input point.
    const apply = (point: string, _chatId: unknown, draft: string): Promise<PromptTransformResult> =>
      Promise.resolve({ aborted: false, text: point === "user_input" ? `${draft} SECRET` : draft });
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
    const host = await seedUser(db, castId<Handle>("host"));
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
    // {{char}} resolved to the primary character; wiFormat wrapped exactly once. Always-scope ⇒ the before-anchor
    // (DEFAULT_PROMPT_CONFIG ships the world_info_before marker — ST parity).
    expect(out.worldInfoBefore).toContain("[Lore: Aria hoards gold]");
  });

  test("F3: wiFormat wrap preserves `$$`/`$&` in entry content (function-replacement form)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
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
    const host = await seedUser(db, castId<Handle>("host"));
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

  test("position routing: always → world_info_before anchor; keyword(fired) → the same anchor's per-turn half; inject → in_chat", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "always", { content: "ALWAYS" });
    await attachChatEntry(host, chatId, "kw", { content: "KW", keys: ["spell"] });
    await attachChatEntry(host, chatId, "depth", { content: "DEPTH", inject: { depth: 2 } });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { pendingUserText: "cast a spell" }));
    const byContent = Object.fromEntries((out.chatInjections ?? []).map((i) => [i.content, i.position]));
    // Always-scope and fired keyword lore both follow the before-anchor (the default has the marker), in the
    // static and the per-turn half; depth rides the injection list.
    expect(out.worldInfoBefore).toContain("ALWAYS");
    expect(out.worldInfoBeforeDynamic).toBe("KW");
    expect(byContent["KW"]).toBeUndefined();
    expect(byContent["DEPTH"]).toBe("in_chat");
  });
});

describe("buildAssembleContext — the ONE injection list + ONE budget pass (§4)", () => {
  test("budget drops lower-priority lore by priority; operator chat_injections are spared", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
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
    expect(out.wiTrace?.activated).toEqual([{ id: castId<WorldEntryId>("world_entry_hi"), title: "hi", keys: [] }]);
  });

  test("budget <= 0 keeps ALL candidates (unbudgeted pass) — the same set that a positive budget drops survives whole", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
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
        { id: castId<WorldEntryId>("world_entry_hi"), title: "hi", keys: [] },
        { id: castId<WorldEntryId>("world_entry_lo"), title: "lo", keys: [] },
      ]),
    );
  });
});

// #1462 — TRIGGER-GATED MARKERS AND THE FALLBACKS THAT READ THEM. Every fallback decision here asks "will
// this marker actually render on THIS turn?" and used to be answered by a predicate that checked only the
// section's type + `enabled`. A section whose `trigger` array excludes the turn's generation type is dropped
// by the BUILD walk, so the fallback stood down for a marker that then delivered nothing — and the content it
// was protecting reached the model NOWHERE. `assembly/sections::hasActiveMarker` is now the one predicate on
// both sides of every one of these decisions.
describe("buildAssembleContext — a trigger-gated marker never suppresses its own fallback", () => {
  /** DEFAULT_PROMPT_CONFIG with `marker`'s section gated to a generation type this turn is not. */
  function gated(marker: string): PromptConfig {
    return promptConfigSchema.parse({
      ...DEFAULT_PROMPT_CONFIG,
      sections: DEFAULT_PROMPT_CONFIG.sections.map((section) =>
        section.type === "marker" && section.marker === marker ? { ...section, trigger: ["swipe"] } : section,
      ),
    });
  }

  test("guided: a trigger-mismatched guided_instruction marker falls back to the depth-0 injection", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId], { promptConfig: gated("guided_instruction") }),
      generationType: "normal",
      guided: { action: "response", input: "be brief" },
    });

    // The marker channel is refused (the section will not render), so the steer takes the injection channel
    // and flips the LOUD `guided_placed_as_injection` warning flag — never silently vanishes.
    expect(out.guidedInstruction).toBeUndefined();
    expect(out.guidedPlacedAsInjection).toBe(true);
    expect(out.chatInjections?.find((i) => i.content.includes("be brief"))).toMatchObject({
      position: "in_chat",
      depth: 0,
      role: "system",
      origin: "guided",
    });
  });

  test("guided: a trigger-MATCHED marker still takes the steer — the marker path is unchanged", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId], { promptConfig: gated("guided_instruction") }),
      generationType: "swipe",
      guided: { action: "response", input: "be brief" },
    });

    expect(out.guidedInstruction).toContain("be brief");
    expect(out.guidedPlacedAsInjection).toBeUndefined();
    expect(out.chatInjections?.some((i) => i.content.includes("be brief"))).toBe(false);
  });

  // THE WORLD-INFO ANCHOR HALF had a second defect UNDER the one the row named: `plainMarkerSection` carried
  // no `trigger` field at all, so a WI anchor could not be gated even though ST sets `injection_trigger` on
  // every prompt-manager entry (owner ruling — the neo-parity oracle is a FLOOR, and the missing field was a
  // parity GAP, not a design boundary). The field is now on the plain markers, the importer carries it, and
  // the anchor routing reads it through the same `hasActiveMarker` every other fallback asks.
  test("a TRIGGER-GATED world_info_before anchor keeps the always-scope entry in the injection list", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "always", { content: "ALWAYS LORE" });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId], { promptConfig: gated("world_info_before") }),
      generationType: "normal",
    });

    // The anchor is dropped by the walk this turn, so the entry must keep its default in_static placement.
    // Routing it into a bucket nothing prints deleted the lore for the turn.
    expect(out.worldInfoBefore).toBe("");
    expect((out.chatInjections ?? []).some((i) => i.content.includes("ALWAYS LORE"))).toBe(true);
  });

  test("a trigger-MATCHED anchor still routes the entry into its bucket", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "always", { content: "ALWAYS LORE" });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, {
      ...inputOf(chatId, host, [charId], { promptConfig: gated("world_info_before") }),
      generationType: "swipe",
    });

    expect(out.worldInfoBefore).toContain("ALWAYS LORE");
    expect((out.chatInjections ?? []).some((i) => i.content.includes("ALWAYS LORE"))).toBe(false);
  });

  // FENCE, NOT A DEFECT PROOF: the disabled arm passes against the pre-fix source too (`hasMarker` already
  // read `enabled`). It stays because it is the other half of "this anchor will not render".
  test("a DISABLED world_info_before anchor keeps the always-scope entry in the injection list", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "always", { content: "ALWAYS LORE" });
    const promptConfig = promptConfigSchema.parse({
      ...DEFAULT_PROMPT_CONFIG,
      sections: DEFAULT_PROMPT_CONFIG.sections.map((section) =>
        section.type === "marker" && section.marker === "world_info_before" ? { ...section, enabled: false } : section,
      ),
    });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, { ...inputOf(chatId, host, [charId], { promptConfig }), generationType: "normal" });

    // The anchor renders nothing, so the entry keeps its default in_static placement and still reaches the
    // model. Routing it into a bucket nothing prints would delete the lore for the turn.
    expect(out.worldInfoBefore).toBe("");
    expect((out.chatInjections ?? []).some((i) => i.content.includes("ALWAYS LORE"))).toBe(true);
  });

  test("an ENABLED anchor still routes the entry into its bucket — the anchor path is unchanged", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "always", { content: "ALWAYS LORE" });
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, { ...inputOf(chatId, host, [charId]), generationType: "normal" });

    expect(out.worldInfoBefore).toContain("ALWAYS LORE");
    expect((out.chatInjections ?? []).some((i) => i.content.includes("ALWAYS LORE"))).toBe(false);
  });
});

// #1462 — `wiTrace.included` summed the WHOLE kept injection list, which carries six candidate families. Any
// turn with an operator injection reported world-info activity on a chat with no books attached at all.
describe("buildAssembleContext — wiTrace.included counts WORLD-INFO, not injections", () => {
  test("an operator injection on a book-less chat reports ZERO world info", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const userInjections: ChatInjection[] = [{ position: "in_static", depth: 0, role: "system", content: "OPERATOR" }];
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { userInjections }));

    expect((out.chatInjections ?? []).map((i) => i.content)).toContain("OPERATOR");
    expect(out.wiTrace?.included).toBe(0);
    expect(out.wiTrace?.activated).toEqual([]);
  });

  test("with lore firing it equals the activated set — both anchor-bucketed and listed entries count once", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    await attachChatEntry(host, chatId, "always", { content: "ALWAYS LORE" });
    await attachChatEntry(host, chatId, "deep", { content: "DEEP LORE", inject: { depth: 1 } });
    const userInjections: ChatInjection[] = [{ position: "in_static", depth: 0, role: "system", content: "OPERATOR" }];
    const ctx = ctxWithCard(cardOf("Aria"));
    const out = await buildAssembleContext(ctx, inputOf(chatId, host, [charId], { userInjections }));

    expect(out.wiTrace?.activated).toHaveLength(2);
    expect(out.wiTrace?.included).toBe(2);
  });
});

describe("buildAssembleContext — SEND USER_INPUT regex (D53; the chat design doc §2/§3)", () => {
  test("the WI haystack + the out-param BOTH see the POST-regex text (no divergence)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
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
    expect(result.worldInfoBeforeDynamic ?? "").toContain("DRAGON LORE");
    expect(result.wiTrace?.matchedKeys).toContainEqual({
      key: "dragon",
      matchedLatestUserMessage: true,
    });
  });

  test("macros resolve in the USER_INPUT replace TEMPLATE (author-side; macros-before-regex)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const ctx = ctxWithCard(cardOf("Aria"));
    const out: { sendUserText?: string } = {};
    await buildAssembleContext(
      ctx,
      inputOf(chatId, host, [charId], {
        pendingUserText: "I greet NAME",
        // The replace template `{{char}}` resolves to the primary character (Aria) — macros run on the template.
        hostTierRegexScripts: [regexScript("u", "NAME", "{{char}}", "USER_INPUT")],
      }),
      out,
    );
    expect(out.sendUserText).toBe("I greet Aria");
  });

  test("no host scripts → the sink carries the frozen composer text (macro-less ⇒ byte-identical passthrough)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
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
    expect(result.worldInfoBeforeDynamic ?? "").not.toContain("DRAGON LORE");
  });
});
