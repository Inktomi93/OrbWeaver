// assembly/assemble — the BUILD section walk (chat.md Part II §2 phase 3 + §3 rules 1/2/3). Pins: the
// macro→frame order, render-ONCE {{original}} recovery (card + room override), the static/dynamic split, the
// chat_history pivot → after-history injection, sendHistory, and the system-block chat-injection routing.
import type { AssembleCharacter, AssembleContext, ChatInjection } from "@orb/contracts/chat";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { assemblePrompt } from "../../../../../packages/server/src/domain/chat/assembly/assemble";
import { shapeContextForSpeaker } from "../../../../../packages/server/src/domain/chat/assembly/speaker-card";
import { expect, test } from "../../../../support/fixtures";

let sectionSeq = 0;
function marker(over: Partial<Extract<PromptSection, { type: "marker" }>>): PromptSection {
  sectionSeq += 1;
  return {
    type: "marker",
    id: `s${sectionSeq}`,
    name: "m",
    marker: "main_prompt",
    role: "system",
    enabled: true,
    ...over,
  } as PromptSection;
}
function literal(content: string, over: Partial<Extract<PromptSection, { type: "literal" }>> = {}): PromptSection {
  sectionSeq += 1;
  return {
    type: "literal",
    id: `l${sectionSeq}`,
    name: "lit",
    role: "system",
    content,
    enabled: true,
    ...over,
  } as PromptSection;
}

function configOf(sections: PromptSection[]): PromptConfig {
  return {
    schemaVersion: 3,
    sections,
    params: {},
    regexScripts: [],
    variables: [],
  };
}

function ctxOf(over: Partial<AssembleContext> = {}): AssembleContext {
  return {
    character: { name: "Aria", description: "a bold knight", personality: "brave" },
    promptConfig: configOf([]),
    recentMessages: [],
    ...over,
  };
}

describe("assemblePrompt — section walk", () => {
  test("renders {{char}} in a templated marker → static; afterHistory empty; sendHistory true", () => {
    const config = configOf([
      marker({ marker: "main_prompt", template: "You are {{char}}." }),
      marker({ marker: "char_description" }),
      marker({ marker: "chat_history" }),
    ]);
    const out = assemblePrompt(config, ctxOf());
    expect(out.static).toContain("You are Aria.");
    expect(out.static).toContain("a bold knight");
    expect(out.dynamic).toBe("");
    expect(out.afterHistory).toEqual([]);
    expect(out.sendHistory).toBe(true);
  });

  test("{{original}}: a card override recovers the preset; a room override recovers the card-resolved value", () => {
    const config = configOf([marker({ marker: "main_prompt", template: "PRESET" })]);
    const carded = ctxOf({
      character: { name: "Aria", description: "", systemPrompt: "CARD {{original}}" },
    });
    expect(assemblePrompt(config, carded).static).toBe("CARD PRESET");
    // Room override wraps the CARD-resolved value (GAP-1 — never the bare preset).
    const roomed = ctxOf({
      character: { name: "Aria", description: "", systemPrompt: "CARD {{original}}" },
      roomOverrides: { mainPrompt: "ROOM {{original}}" },
    });
    expect(assemblePrompt(config, roomed).static).toBe("ROOM CARD PRESET");
  });

  test("memory marker lands in the DYNAMIC half (per-turn), not static", () => {
    const config = configOf([marker({ marker: "main_prompt", template: "sys" }), marker({ marker: "memory" }), marker({ marker: "chat_history" })]);
    const out = assemblePrompt(config, ctxOf({ memory: "past events" }));
    expect(out.static).toContain("sys");
    expect(out.dynamic).toContain("past events");
    expect(out.trace.memoryIncluded).toBe(true);
  });

  test("a section AFTER the chat_history pivot is delivered as an after-history injection", () => {
    const config = configOf([
      marker({ marker: "main_prompt", template: "sys" }),
      marker({ marker: "chat_history" }),
      literal("post-pivot note", { role: "system" }),
    ]);
    const out = assemblePrompt(config, ctxOf());
    expect(out.static).toBe("sys");
    expect(out.afterHistory).toHaveLength(1);
    expect(out.afterHistory[0]).toMatchObject({
      position: "in_chat",
      depth: 0,
      content: "post-pivot note",
    });
  });

  test("a disabled chat_history pivot suppresses history (sendHistory false)", () => {
    const config = configOf([marker({ marker: "main_prompt", template: "sys" }), marker({ marker: "chat_history", enabled: false })]);
    expect(assemblePrompt(config, ctxOf()).sendHistory).toBe(false);
  });

  test("system-block chat injections route by position (before prepends, in_prompt → dynamic)", () => {
    const config = configOf([marker({ marker: "main_prompt", template: "BODY" })]);
    const injections: ChatInjection[] = [
      { position: "before_prompt", depth: 0, role: "system", content: "TOP" },
      { position: "in_prompt", depth: 0, role: "system", content: "SUFFIX" },
    ];
    const out = assemblePrompt(config, ctxOf({ chatInjections: injections }));
    expect(out.static.startsWith("TOP")).toBe(true);
    expect(out.static).toContain("BODY");
    expect(out.dynamic).toContain("SUFFIX");
    expect(out.trace.chatInjectionsIncluded).toBe(2);
  });

  test("a volatile macro ({{date}}) in a STATIC section is reported as a cache-buster", () => {
    const config = configOf([literal("today is {{date}}", { role: "system" }), marker({ marker: "chat_history" })]);
    const out = assemblePrompt(config, ctxOf({ nowMs: 1_750_000_000_000, timezone: "UTC" }));
    expect(out.trace.staticCacheBusters).toContain("date");
  });
});

// `injection_trigger` section-gating (`shouldTrigger`/`generationTypeBucket`, assemble.ts ~L499-515):
// fires only on a matching `generationType`, swipe/regenerate alias to the same bucket, an absent
// trigger always fires, and a trigger-gated section is never eligible for the cached static prefix
// (the KV-cache-safety invariant).
describe("assemblePrompt — injection_trigger section-gating", () => {
  test("fires only when generationType matches one of the section's triggers", () => {
    const config = configOf([literal("continue-only", { trigger: ["continue"] })]);
    expect(assemblePrompt(config, ctxOf({ generationType: "continue" })).dynamic).toContain("continue-only");
    expect(assemblePrompt(config, ctxOf({ generationType: "normal" })).dynamic).not.toContain("continue-only");
  });

  test("swipe and regenerate alias to the same generation-type bucket", () => {
    const config = configOf([literal("swipe-gated", { trigger: ["swipe"] })]);
    expect(assemblePrompt(config, ctxOf({ generationType: "swipe" })).dynamic).toContain("swipe-gated");
    expect(assemblePrompt(config, ctxOf({ generationType: "regenerate" })).dynamic).toContain("swipe-gated");
    expect(assemblePrompt(config, ctxOf({ generationType: "normal" })).dynamic).not.toContain("swipe-gated");
  });

  test("an absent trigger always fires, regardless of generation type", () => {
    const config = configOf([literal("always")]);
    expect(assemblePrompt(config, ctxOf({ generationType: "quiet" })).static).toContain("always");
    expect(assemblePrompt(config, ctxOf({ generationType: "impersonate" })).static).toContain("always");
  });

  test("an absent generationType defaults to normal", () => {
    const config = configOf([literal("normal-only", { trigger: ["normal"] })]);
    expect(assemblePrompt(config, ctxOf()).dynamic).toContain("normal-only");
  });

  test("a trigger-gated section always lands in the dynamic half, never the cached static prefix", () => {
    const config = configOf([marker({ marker: "main_prompt", template: "sys", trigger: ["normal"] })]);
    const out = assemblePrompt(config, ctxOf({ generationType: "normal" }));
    expect(out.static).toBe("");
    expect(out.dynamic).toContain("sys");
  });
});

// F6: in merged mode a co-speaker's scenario has ONE home — the char_description co-block (renderCoSpeakers,
// "[Kai's scenario]"). The scenario marker used to ALSO fold it in via resolveScopeFallback, double-emitting
// every co-speaker scenario. It now emits the ACTIVE speaker's scenario only.
describe("assemblePrompt — merged co-speaker scenario (F6: single emission)", () => {
  const char = (name: string, scenario: string): AssembleCharacter => ({
    name,
    description: `${name} description`,
    personality: `${name} personality`,
    scenario,
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
  });
  const aria = char("Aria", "ARIA-SCENARIO");
  const kai = char("Kai", "KAI-SCENARIO");

  test("a co-speaker's scenario appears ONCE (the co-block), not doubled into the scenario marker", () => {
    const base = ctxOf({
      character: aria,
      promptConfig: DEFAULT_PROMPT_CONFIG,
      cast: [aria, kai],
      castCharacterIds: [castId<CharacterId>("character_aria"), castId<CharacterId>("character_kai")],
      castMembers: [
        { kind: "character", characterId: castId<CharacterId>("character_aria") },
        { kind: "character", characterId: castId<CharacterId>("character_kai") },
      ],
      pinnedPersona: { name: "Nate", description: "" },
      activePersona: { name: "Nate", description: "" },
    });
    const ctx = shapeContextForSpeaker(base, {
      ref: { kind: "character", characterId: castId<CharacterId>("character_aria") },
      cardScope: "merged",
    });
    const out = assemblePrompt(DEFAULT_PROMPT_CONFIG, ctx);
    const all = `${out.static}\n\n${out.dynamic}`;
    expect(all.split("KAI-SCENARIO").length - 1).toBe(1);
    expect(all.split("ARIA-SCENARIO").length - 1).toBe(1);
  });
});

describe("assemblePrompt — PD-140/D25: implicit compact_summary prepend", () => {
  test("a preset with no compact_summary section still delivers ctx.compactSummary (stateless-runner safety net)", () => {
    const config = configOf([marker({ marker: "main_prompt", template: "sys" }), marker({ marker: "chat_history" })]);
    const out = assemblePrompt(config, ctxOf({ compactSummary: "the summary so far" }));
    expect(out.static).toContain("the summary so far");
    expect(out.trace.compactSummaryIncluded).toBe(true);
  });

  test("no synthesis when there's no compactSummary to deliver", () => {
    const config = configOf([marker({ marker: "main_prompt", template: "sys" }), marker({ marker: "chat_history" })]);
    const out = assemblePrompt(config, ctxOf());
    expect(out.trace.compactSummaryIncluded).toBe(false);
    expect(out.trace.dynamicSections).not.toContain("__synthetic-compact-summary");
  });

  test("an existing enabled compact_summary section wins — no duplicate synthesis", () => {
    const config = configOf([marker({ marker: "main_prompt", template: "sys" }), marker({ marker: "compact_summary" }), marker({ marker: "chat_history" })]);
    const out = assemblePrompt(config, ctxOf({ compactSummary: "the summary so far" }));
    expect(out.static.split("the summary so far").length - 1).toBe(1);
  });
});
