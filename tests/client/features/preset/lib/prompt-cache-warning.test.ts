import type { PromptConfig, PromptSection, UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { cacheInvalidatingSections } from "../../../../../packages/client/src/features/preset/lib/prompt-cache-warning.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PRESET_ID = castId<PresetId>("preset_cachewarning");
const HISTORY: PromptSection = { type: "marker", id: "history", name: "Chat History", marker: "chat_history", role: "system", enabled: true };

function config(sections: readonly PromptSection[], userMacros: readonly UserMacroSpec[] = []): PromptConfig {
  return { ...DEFAULT_PROMPT_CONFIG, sections: [...sections], userMacros: [...userMacros] };
}

test("finds every enabled per-turn source above history, including volatile user-macro references", () => {
  const userMacros: UserMacroSpec[] = [{ name: "nowish", description: "", args: [], body: "{{time}}", inputs: [], strict: false }];
  const sections: PromptSection[] = [
    { type: "literal", id: "static", name: "Static", role: "system", content: "fixed", enabled: true },
    { type: "marker", id: "world", name: "Lore", marker: "world_info_before", role: "system", enabled: true },
    { type: "literal", id: "macro", name: "Clock", role: "system", content: "{{nowish}}", enabled: true },
    { type: "literal", id: "trigger", name: "Triggered", role: "system", content: "fixed", enabled: true, trigger: ["continue"] },
    HISTORY,
    { type: "marker", id: "memory", name: "Memory", marker: "memory", role: "system", enabled: true },
  ];

  expect(cacheInvalidatingSections(config(sections, userMacros), PRESET_ID).map((section) => section.name)).toEqual(["Lore", "Clock", "Triggered"]);
});

test("ignores disabled, static, and below-history content", () => {
  const sections: PromptSection[] = [
    { type: "literal", id: "static", name: "Static", role: "system", content: "fixed", enabled: true },
    { type: "marker", id: "off", name: "Off", marker: "memory", role: "system", enabled: false },
    HISTORY,
    { type: "literal", id: "late", name: "Late clock", role: "system", content: "{{time}}", enabled: true },
  ];
  expect(cacheInvalidatingSections(config(sections), PRESET_ID)).toEqual([]);
});

test("ignores above-pivot sections that assembly delivers inside chat history", () => {
  const userRole: PromptSection = { type: "literal", id: "user_role", name: "User role", role: "user", content: "{{time}}", enabled: true };
  const injected: PromptSection = {
    type: "literal",
    id: "injected",
    name: "Injected",
    role: "system",
    content: "{{time}}",
    enabled: true,
    inject: { depth: 2 },
  };
  expect(cacheInvalidatingSections(config([userRole, injected, HISTORY]), PRESET_ID)).toEqual([]);
});

test("recognizes volatile calls through every evaluable canonical flag spelling", () => {
  const flagged = ["{{time}}", "{{#time}}", "{{!time}}", "{{?time}}", "{{~time}}", "{{>time}}", "{{#!?~>time}}"];
  for (const [index, content] of flagged.entries()) {
    const section: PromptSection = { type: "literal", id: `flag_${String(index)}`, name: content, role: "system", content, enabled: true };
    expect(cacheInvalidatingSections(config([section, HISTORY]), PRESET_ID).map((candidate) => candidate.id), content).toEqual([section.id]);
  }
});

test("honors parser escapes, closes, whitespace boundaries, nested args, and block children", () => {
  const cases: readonly { readonly content: string; readonly warns: boolean }[] = [
    { content: String.raw`\{{time}}`, warns: false },
    { content: String.raw`\\{{time}}`, warns: false },
    { content: "{{/time}}", warns: false },
    { content: "{{ time}}", warns: false },
    { content: "{{! time}}", warns: false },
    { content: "{{// {{time}} is documentation }}", warns: false },
    { content: "{{random::fixed::{{!time}}}}", warns: true },
    { content: "{{random:: fixed :: {{?time}} }}", warns: true },
    { content: "{{if::true}}before {{~time}} after{{/if}}", warns: true },
    { content: "{{not_registered}}before {{time}} after{{/not_registered}}", warns: true },
    { content: String.raw`{{if::"true"}}\{{time}}{{/if}}`, warns: false },
  ];
  for (const [index, example] of cases.entries()) {
    const section: PromptSection = {
      type: "literal",
      id: `grammar_${String(index)}`,
      name: example.content,
      role: "system",
      content: example.content,
      enabled: true,
    };
    expect(cacheInvalidatingSections(config([section, HISTORY]), PRESET_ID).length > 0, example.content).toBe(example.warns);
  }
});

test("does not warn for nested bytes that the evaluator discards", () => {
  const unknown: PromptSection = {
    type: "literal",
    id: "unknown_outer",
    name: "Unknown outer",
    role: "system",
    content: "{{not_registered::{{time}}}}",
    enabled: true,
  };
  const discarded: PromptSection = {
    type: "literal",
    id: "discarded_outer",
    name: "Discarded outer",
    role: "system",
    content: "{{noop::{{time}}}}",
    enabled: true,
  };
  const delayedDiscard: PromptSection = { ...discarded, id: "delayed_discard", content: "{{?noop::{{time}}}}" };
  const discardedBlock: PromptSection = { ...discarded, id: "discarded_block", content: "{{banned}}{{time}}{{/banned}}" };
  const transformed: PromptSection = {
    type: "literal",
    id: "transformed_outer",
    name: "Transformed outer",
    role: "system",
    content: "{{uppercase}}{{time}}{{/uppercase}}",
    enabled: true,
  };

  expect(cacheInvalidatingSections(config([unknown, HISTORY]), PRESET_ID)).toEqual([]);
  expect(cacheInvalidatingSections(config([discarded, HISTORY]), PRESET_ID)).toEqual([]);
  expect(cacheInvalidatingSections(config([delayedDiscard, HISTORY]), PRESET_ID)).toEqual([]);
  expect(cacheInvalidatingSections(config([discardedBlock, HISTORY]), PRESET_ID)).toEqual([]);
  expect(cacheInvalidatingSections(config([transformed, HISTORY]), PRESET_ID).map((section) => section.id)).toEqual([transformed.id]);
});

test("finds direct staged data, recursive card prose, and runtime variable reads above history", () => {
  const contents = ["{{memory}}", "{{databank}}", "{{guided_instruction}}", "{{description}}", "{{getvar::counter}}", "{{hasvar::counter}}", "{{getglobalvar::counter}}"];
  const sections = contents.map(
    (content, index): PromptSection => ({ type: "literal", id: `dependency_${String(index)}`, name: content, role: "system", content, enabled: true }),
  );
  expect(cacheInvalidatingSections(config([...sections, HISTORY]), PRESET_ID).map((section) => section.id)).toEqual(sections.map((section) => section.id));
});

test("warns for an above-history variable read whose value can be advanced below history", () => {
  const read: PromptSection = { type: "literal", id: "read", name: "Counter", role: "system", content: "{{getvar::counter}}", enabled: true };
  const advance: PromptSection = { type: "literal", id: "advance", name: "Advance", role: "system", content: "{{incvar::counter}}", enabled: true };
  expect(cacheInvalidatingSections(config([read, HISTORY, advance]), PRESET_ID).map((section) => section.id)).toEqual([read.id]);
});

test("follows cache dependence through user macros but keeps inert unknown calls static", () => {
  const userMacros: UserMacroSpec[] = [
    { name: "recall", description: "", args: [], body: "{{memory}}", inputs: [], strict: false },
    { name: "inert", description: "", args: [], body: "{{not_registered::{{time}}}}", inputs: [], strict: false },
  ];
  const recall: PromptSection = { type: "literal", id: "recall", name: "Recall", role: "system", content: "{{recall}}", enabled: true };
  const inert: PromptSection = { type: "literal", id: "inert", name: "Inert", role: "system", content: "{{inert}}", enabled: true };
  expect(cacheInvalidatingSections(config([recall, inert, HISTORY], userMacros), PRESET_ID).map((section) => section.id)).toEqual([recall.id]);
});

test("scans only a statically selected if branch and both branches when the predicate needs context", () => {
  const examples: readonly { readonly id: string; readonly content: string; readonly warns: boolean }[] = [
    { id: "static_then", content: '{{if::"1"}}fixed{{else}}{{time}}{{/if}}', warns: false },
    { id: "static_else", content: '{{if::"0"}}{{time}}{{else}}fixed{{/if}}', warns: false },
    { id: "dynamic", content: "{{if::flag}}fixed{{else}}{{time}}{{/if}}", warns: true },
  ];
  for (const example of examples) {
    const section: PromptSection = {
      type: "literal",
      id: example.id,
      name: example.id,
      role: "system",
      content: example.content,
      enabled: true,
    };
    expect(cacheInvalidatingSections(config([section, HISTORY]), PRESET_ID).length > 0, example.id).toBe(example.warns);
  }
});
