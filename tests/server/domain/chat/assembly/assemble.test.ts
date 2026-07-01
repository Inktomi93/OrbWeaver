// assembly/assemble — the BUILD section walk (chat.md Part II §2 phase 3 + §3 rules 1/2/3). Pins: the
// macro→frame order, render-ONCE {{original}} recovery (card + room override), the static/dynamic split, the
// chat_history pivot → after-history injection, sendHistory, and the system-block chat-injection routing.
import type { AssembleContext, ChatInjection } from "@orb/contracts/chat";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { describe } from "vitest";
import { assemblePrompt } from "../../../../../packages/server/src/domain/chat/assembly/assemble";
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
function literal(
  content: string,
  over: Partial<Extract<PromptSection, { type: "literal" }>> = {},
): PromptSection {
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
    // Card override wraps the preset.
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
    const config = configOf([
      marker({ marker: "main_prompt", template: "sys" }),
      marker({ marker: "memory" }),
      marker({ marker: "chat_history" }),
    ]);
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
    const config = configOf([
      marker({ marker: "main_prompt", template: "sys" }),
      marker({ marker: "chat_history", enabled: false }),
    ]);
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
    const config = configOf([
      literal("today is {{date}}", { role: "system" }),
      marker({ marker: "chat_history" }),
    ]);
    const out = assemblePrompt(config, ctxOf({ nowMs: 1_750_000_000_000, timezone: "UTC" }));
    expect(out.trace.staticCacheBusters).toContain("date");
  });
});
