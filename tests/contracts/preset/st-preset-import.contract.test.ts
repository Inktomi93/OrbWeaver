// @orb/contracts/preset — the SillyTavern chat-completions preset importer's mapping and refusals.

import type { PromptConfig } from "@orb/contracts/preset";
import { buildPresetFile, DEFAULT_PROMPT_CONFIG, importStChatCompletionPreset, parsePresetFile, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// The SillyTavern chat-completions preset importer's sampling mapping (D68-A). `min_p` (was DROPPED with "no
// neo sampling vocab") now maps → params.minP; ST's 0-default = "off" is NOT carried (the top_a/top_k
// sentinel discipline). Quoted keys keep the ST wire snake_case off the naming lint. The importer throws
// unless the blob is a recognizable ST preset (prompts[]/prompt_order) — the empty `prompts` isolates sampling.
function stBlob(fields: Record<string, unknown>): Record<string, unknown> {
  return { prompts: [], ...fields };
}

/** The imported depth of the first section (a custom ST prompt maps to a LITERAL section). */
function firstInjectDepth(config: PromptConfig): number | undefined {
  const section = config.sections[0];
  return section?.type === "literal" ? section.inject?.depth : undefined;
}

/** A minimal ST preset carrying ONE absolute-depth prompt — the shape the injection bounds ride on. */
function stInjectedPreset(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    prompts: [{ identifier: "a", name: "A", content: "You are helpful.", role: "system", injection_position: 1, enabled: true, ...fields }],
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "a", enabled: true }] }],
  };
}

// #1363 — one out-of-range foreign value used to replace the WHOLE imported preset with
// DEFAULT_PROMPT_CONFIG while every success signal lied: no throw, `dropped` empty, and `sectionCount`
// reporting the sections the importer BUILT (2) rather than the default's (13). Per-value clamp, recorded.
test("importStChatCompletionPreset (#1363): an out-of-range injection_depth clamps ONE field, never the config", () => {
  const atCap = importStChatCompletionPreset(stInjectedPreset({ injection_depth: MAX_INJECTION_DEPTH }));
  expect(atCap.config).not.toEqual(DEFAULT_PROMPT_CONFIG);
  expect(atCap.dropped).toEqual([]);
  expect(firstInjectDepth(atCap.config)).toBe(MAX_INJECTION_DEPTH);

  const overCap = importStChatCompletionPreset(stInjectedPreset({ injection_depth: MAX_INJECTION_DEPTH + 1 }));
  expect(overCap.config).not.toEqual(DEFAULT_PROMPT_CONFIG);
  expect(overCap.config.sections).toHaveLength(1);
  expect(firstInjectDepth(overCap.config)).toBe(MAX_INJECTION_DEPTH);
  // The clamp is REPORTED — `dropped` is the list whose whole job is telling the user what was lost.
  expect(overCap.dropped).toHaveLength(1);
  expect(overCap.dropped[0]?.field).toBe("prompts.a.injection_depth");
});

test("importStChatCompletionPreset (#1363): sectionCount describes the RETURNED config", () => {
  const result = importStChatCompletionPreset(stInjectedPreset({ injection_depth: -5 }));
  expect(result.sectionCount).toBe(result.config.sections.length);
  expect(firstInjectDepth(result.config)).toBe(0);
  expect(result.dropped[0]?.field).toBe("prompts.a.injection_depth");
});

// #1462 — `plainMarkerSection` carried no `trigger`, so `sectionFromPrompt` DROPPED an imported
// `injection_trigger` for the three plain markers (World Info before/after, Chat History) while carrying it
// for every other prompt. ST sets that field on every prompt-manager entry, and the parity oracle is a FLOOR,
// so this is a gap, not a boundary. `injection_position`/`injection_depth` stay dropped for a plain marker on
// purpose: `assembly/assemble::injectionDepthFor` refuses those three a depth, so orb has no reader for them.
test("importStChatCompletionPreset (#1462): a PLAIN marker's injection_trigger survives the import", () => {
  const result = importStChatCompletionPreset({
    prompts: [
      { identifier: "worldInfoBefore", name: "World Info (before)", marker: true, injection_trigger: ["swipe", "continue"] },
      { identifier: "chatHistory", name: "Chat History", marker: true, injection_trigger: ["normal"] },
    ],
    prompt_order: [
      {
        character_id: 100_001,
        order: [
          { identifier: "worldInfoBefore", enabled: true },
          { identifier: "chatHistory", enabled: true },
        ],
      },
    ],
  });

  const anchor = result.config.sections.find((section) => section.type === "marker" && section.marker === "world_info_before");
  const pivot = result.config.sections.find((section) => section.type === "marker" && section.marker === "chat_history");
  expect(anchor === undefined || !("trigger" in anchor) ? undefined : anchor.trigger).toEqual(["swipe", "continue"]);
  expect(pivot === undefined || !("trigger" in pivot) ? undefined : pivot.trigger).toEqual(["normal"]);
  // A plain marker still stores no placement — there is nothing in orb that could honour one.
  expect(anchor === undefined ? true : "inject" in anchor).toBe(false);
});

test("importStChatCompletionPreset (#1462): a plain marker with NO injection_trigger stays unset, not empty", () => {
  const result = importStChatCompletionPreset({
    prompts: [{ identifier: "worldInfoBefore", name: "World Info (before)", marker: true }],
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "worldInfoBefore", enabled: true }] }],
  });

  const anchor = result.config.sections[0];
  expect(anchor === undefined ? true : "trigger" in anchor).toBe(false);
});

test("a plain marker's trigger SURVIVES the preset file round-trip (buildPresetFile → parsePresetFile)", () => {
  const imported = importStChatCompletionPreset({
    prompts: [{ identifier: "worldInfoAfter", name: "World Info (after)", marker: true, injection_trigger: ["quiet"] }],
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "worldInfoAfter", enabled: true }] }],
  }).config;
  const parsed = parsePresetFile(buildPresetFile("round-trip", imported));

  expect(parsed.ok).toBe(true);
  expect(parsed.ok ? parsed.config.sections : []).toEqual(imported.sections);
});

// #1580 — the reader's TWO refusals were one bare Error, so the import door could only say "the reader
// stopped" for a file the reader had RECOGNISED and then refused. The typed outcome carries the difference;
// the throwing wrapper keeps both messages byte-for-byte, so no caller's copy moved.
/** A RECOGNISED ST preset (prompts + prompt_order) whose literal section blows the schema's content bound —
 *  #1363's intact-parse belt refuses it AFTER recognition. */
function stRefusedPreset(): Record<string, unknown> {
  return {
    prompts: [{ identifier: "lore-dump", name: "Lore dump", content: "x".repeat(100_001) }],
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "lore-dump", enabled: true }] }],
  };
}

test("tryImportStChatCompletionPreset (#1580): a RECOGNISED preset refused by the intact belt answers recognised:true", () => {
  const outcome = tryImportStChatCompletionPreset(stRefusedPreset());
  expect(outcome.ok).toBe(false);
  // The discriminant is the whole point: this file IS a SillyTavern preset, and the door must be able to say so.
  expect(outcome).toMatchObject({ ok: false, recognised: true });
  expect(outcome.ok ? "" : outcome.reason).toContain("This SillyTavern preset mapped to a config orb cannot store");
  expect(outcome.ok ? "" : outcome.reason).toContain("(schema-rejected)");
  // #1592 — the belt now NAMES which prompt and which field blew the bound, so the operator can tell which
  // prompt to shrink instead of reading the bare failure word.
  expect(outcome.ok ? "" : outcome.reason).toContain('the ST prompt "lore-dump" `content`: Too big: expected string to have <=100000 characters');
});

test("tryImportStChatCompletionPreset (#1580): an object the reader never claims answers recognised:false", () => {
  const outcome = tryImportStChatCompletionPreset({ note: "some other tool's export", items: [1, 2, 3] });
  expect(outcome).toMatchObject({ ok: false, recognised: false });
  expect(outcome.ok ? "" : outcome.reason).toBe("Not a SillyTavern Chat Completion preset (expected prompts[] + prompt_order).");
});

test("tryImportStChatCompletionPreset (#1580): a good preset answers ok:true with the wrapper's EXACT result", () => {
  const outcome = tryImportStChatCompletionPreset(stInjectedPreset({ injection_depth: 3 }));
  expect(outcome.ok).toBe(true);
  // One mapper, one result — the wrapper adds a throw and nothing else.
  expect(outcome.ok ? outcome.result : null).toEqual(importStChatCompletionPreset(stInjectedPreset({ injection_depth: 3 })));
});

test("importStChatCompletionPreset (#1580): the throwing wrapper still throws BOTH refusals, verbatim", () => {
  expect(() => importStChatCompletionPreset({ note: "not st" })).toThrow("Not a SillyTavern Chat Completion preset (expected prompts[] + prompt_order).");
  expect(() => importStChatCompletionPreset(stRefusedPreset())).toThrow(/^This SillyTavern preset mapped to a config orb cannot store/u);
});

test("importStChatCompletionPreset (D68-A): a non-default min_p maps onto params.minP", () => {
  const result = importStChatCompletionPreset(stBlob({ min_p: 0.07 }));
  expect(result.config.params.minP).toBe(0.07);
  expect(result.dropped.some((d) => d.field === "min_p")).toBe(false);
});

test("importStChatCompletionPreset (D68-A): ST's default min_p (0 = off) is NOT carried", () => {
  const result = importStChatCompletionPreset(stBlob({ min_p: 0 }));
  expect(result.config.params.minP).toBeUndefined();
  expect(result.dropped.some((d) => d.field === "min_p")).toBe(false);
});

// G1 (redesign §10): `top_a` was DROPPED with "no neo sampling vocab" while `userIntentSchema.topA` sat two
// hundred lines up — the two halves contradicted, and the drop won. It now maps exactly like `min_p`, and
// ST's own default (0 = off, `SillyTavern/public/scripts/openai.js:418`) is the sentinel NOT carried.
test("importStChatCompletionPreset (G1): a non-default top_a maps onto params.topA and is no longer dropped", () => {
  const result = importStChatCompletionPreset(stBlob({ top_a: 0.2 }));
  expect(result.config.params.topA).toBe(0.2);
  expect(result.dropped.some((d) => d.field === "top_a")).toBe(false);
});

test("importStChatCompletionPreset (G1): ST's default top_a (0 = off) is NOT carried", () => {
  const result = importStChatCompletionPreset(stBlob({ top_a: 0 }));
  expect(result.config.params.topA).toBeUndefined();
  expect(result.dropped.some((d) => d.field === "top_a")).toBe(false);
});

test("importStChatCompletionPreset (D68-A): an absent min_p produces no minP field", () => {
  const result = importStChatCompletionPreset(stBlob({ temperature: 0.8 }));
  expect(result.config.params.minP).toBeUndefined();
  expect(result.config.params.temperature).toBe(0.8);
});

// D66-C (W6 REVERSED): ST `squash_system_messages` maps onto `params.advanced.squashSystemMessages` (the
// preset now owns the knob) instead of being dropped. `group_nudge_prompt` STAYS dropped (room-owned, not
// preset-owned) but its reason string was corrected off the stale "no group chats".
test("importStChatCompletionPreset: squash_system_messages:true maps onto params.advanced.squashSystemMessages", () => {
  const result = importStChatCompletionPreset(stBlob({ squash_system_messages: true }));
  expect(result.config.params.advanced?.squashSystemMessages).toBe(true);
  expect(result.dropped.some((d) => d.field === "squash_system_messages")).toBe(false);
});

test("importStChatCompletionPreset: squash_system_messages:false is NOT carried (ST default = off)", () => {
  const result = importStChatCompletionPreset(stBlob({ squash_system_messages: false }));
  expect(result.config.params.advanced?.squashSystemMessages).toBeUndefined();
  expect(result.dropped.some((d) => d.field === "squash_system_messages")).toBe(false);
});

test("importStChatCompletionPreset: group_nudge_prompt still drops, with the corrected room-owned reason", () => {
  const result = importStChatCompletionPreset(stBlob({ group_nudge_prompt: "poke the group" }));
  const drop = result.dropped.find((d) => d.field === "group_nudge_prompt");
  expect(drop?.reason).toBe("group nudge is room-owned, not preset-owned");
});

test("importStChatCompletionPreset: new_chat_prompt maps onto formatStrings.newChatMarker (2026-08-15 re-judgment)", () => {
  // The seat postdates the old "no new-chat injection slot" drop row: `newChatMarker` is the history-START
  // boundary the assembler actually reads (`assembly/context.ts` newChatMarkerCandidate / G9).
  const result = importStChatCompletionPreset(stBlob({ new_chat_prompt: "[Start a new Chat]" }));
  expect(result.config.formatStrings?.newChatMarker).toBe("[Start a new Chat]");
  expect(result.dropped.some((d) => d.field === "new_chat_prompt")).toBe(false);
});

test("importStChatCompletionPreset: new_group_chat_prompt still drops — orb's ONE boundary is room-agnostic", () => {
  // ST fires this string only in GROUP chats; orb's `newChatMarker` fires in every room. Mapping a
  // group-only boundary onto the room-agnostic key would inject group framing into every SOLO chat —
  // a behavior change, not a translation — so the drop stays, with the truthful reason.
  const result = importStChatCompletionPreset(stBlob({ new_group_chat_prompt: "a fresh group scene" }));
  const drop = result.dropped.find((d) => d.field === "new_group_chat_prompt");
  expect(drop?.reason).toBe(
    "orb's one history-START boundary (newChatMarker) is room-agnostic and maps from new_chat_prompt; a group-only boundary has no conditional seat",
  );
});

test("importStChatCompletionPreset: impersonation_prompt maps onto formatStrings.impersonateNudge (no longer dropped)", () => {
  const result = importStChatCompletionPreset(stBlob({ impersonation_prompt: "speak as the user" }));
  expect(result.config.formatStrings?.impersonateNudge).toBe("speak as the user");
  expect(result.dropped.some((d) => d.field === "impersonation_prompt")).toBe(false);
});

test("importStChatCompletionPreset: continue_nudge_prompt maps onto formatStrings.continueNudge (no longer dropped)", () => {
  const result = importStChatCompletionPreset(stBlob({ continue_nudge_prompt: "keep going" }));
  expect(result.config.formatStrings?.continueNudge).toBe("keep going");
  expect(result.dropped.some((d) => d.field === "continue_nudge_prompt")).toBe(false);
});

test("importStChatCompletionPreset: a blank prompt slot is omitted (falls back to the built-in default)", () => {
  const result = importStChatCompletionPreset(stBlob({ impersonation_prompt: "   ", continue_nudge_prompt: "" }));
  expect(result.config.formatStrings?.impersonateNudge).toBeUndefined();
  expect(result.config.formatStrings?.continueNudge).toBeUndefined();
});
