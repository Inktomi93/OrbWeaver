import type { PromptConfig } from "@orb/contracts/preset";
import { buildPresetFile, DEFAULT_PROMPT_CONFIG, MARKER_TYPES, parsePresetFile, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import { expect, test } from "@orb/testkit/node";

/** The sections the file itself authored: the import adds the named slot sections around them. */
function authored(result: { readonly config: PromptConfig; readonly addedSections: readonly string[] }): PromptConfig["sections"] {
  return result.config.sections.filter((section) => !result.addedSections.includes(section.name));
}

const INJECTED_PRESET = {
  prompts: [{ identifier: "a", name: "A", content: "You are helpful.", role: "system", ["injection_position"]: 1, ["injection_depth"]: 3 }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "a", enabled: true }] }],
};

test("depth bounds clamp one field, report its loss and count the returned sections", () => {
  for (const depth of [MAX_INJECTION_DEPTH, MAX_INJECTION_DEPTH + 1, -5]) {
    const outcome = tryImportStChatCompletionPreset({
      ...INJECTED_PRESET,
      prompts: INJECTED_PRESET.prompts.map((prompt) => ({ ...prompt, ["injection_depth"]: depth })),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      throw new Error(outcome.reason);
    }
    const { config, dropped, sectionCount } = outcome.result;
    expect(config).not.toEqual(DEFAULT_PROMPT_CONFIG);
    expect(authored(outcome.result)).toEqual([
      {
        type: "literal",
        id: "a",
        name: "A",
        role: "system",
        content: "You are helpful.",
        enabled: true,
        inject: { depth: depth < 0 ? 0 : MAX_INJECTION_DEPTH },
      },
    ]);
    expect(sectionCount).toBe(config.sections.length);
    const droppedDepth = { field: "prompts.a.injection_depth", reason: expect.stringContaining(`SillyTavern sent ${depth};`) };
    expect(dropped).toEqual(depth === MAX_INJECTION_DEPTH ? [] : [droppedDepth]);
  }
});

test("plain marker triggers survive mapping and native round-trip without placement or invented triggers", () => {
  const outcome = tryImportStChatCompletionPreset({
    prompts: [
      { identifier: "worldInfoBefore", ["injection_trigger"]: ["swipe", "continue"], ["injection_position"]: 1, ["injection_depth"]: 3 },
      { identifier: "chatHistory", ["injection_trigger"]: ["normal"] },
      { identifier: "worldInfoAfter", ["injection_trigger"]: ["quiet"] },
    ],
  });
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  const { config } = outcome.result;
  expect(authored(outcome.result)).toEqual([
    {
      type: "marker",
      id: "worldInfoBefore",
      name: "worldInfoBefore",
      marker: "world_info_before",
      role: "system",
      enabled: true,
      trigger: ["swipe", "continue"],
    },
    { type: "marker", id: "chatHistory", name: "chatHistory", marker: "chat_history", role: "system", enabled: true, trigger: ["normal"] },
    { type: "marker", id: "worldInfoAfter", name: "worldInfoAfter", marker: "world_info_after", role: "system", enabled: true, trigger: ["quiet"] },
  ]);
  const parsed = parsePresetFile(buildPresetFile("round-trip", config));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  expect(parsed.config).toEqual(config);
  const unset = tryImportStChatCompletionPreset({ prompts: [{ identifier: "worldInfoBefore" }] });
  expect(unset.ok).toBe(true);
  if (!unset.ok) {
    throw new Error(unset.reason);
  }
  expect(authored(unset.result)).toStrictEqual([
    { type: "marker", id: "worldInfoBefore", name: "worldInfoBefore", marker: "world_info_before", role: "system", enabled: true },
  ]);
});

test("recognised schema refusal identifies the source prompt and field, unlike unrelated JSON", () => {
  const valid = INJECTED_PRESET;
  expect(tryImportStChatCompletionPreset(valid).ok).toBe(true);
  const refused = tryImportStChatCompletionPreset({ ...valid, prompts: [{ ...valid.prompts[0], identifier: "a", content: "x".repeat(100_001) }] });
  expect(refused).toMatchObject({ ok: false, recognised: true });
  if (refused.ok) {
    throw new Error("Oversized content was imported");
  }
  expect(refused.reason).toContain("(schema-rejected)");
  expect(refused.reason).toContain('the ST prompt "a" `content`: Too big: expected string to have <=100000 characters');
  expect(tryImportStChatCompletionPreset({ note: "another tool's export", items: [1, 2, 3] })).toMatchObject({ ok: false, recognised: false });
});

test("a prompt with an empty identifier is a recognised refusal, never a throw", () => {
  const valid = INJECTED_PRESET;
  const [first] = valid.prompts;
  const refused = tryImportStChatCompletionPreset({
    ...valid,
    prompts: [{ ...first, identifier: "" }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "", enabled: true }] }],
  });
  expect(refused).toMatchObject({ ok: false, recognised: true });
});

test("sampling values map while disabled sentinels and absent fields remain unset", () => {
  const enabled = tryImportStChatCompletionPreset({ prompts: [], temperature: 0.8, ["min_p"]: 0.07, ["top_a"]: 0.2, ["top_k"]: 12, seed: 0 });
  const disabled = tryImportStChatCompletionPreset({ prompts: [], ["min_p"]: 0, ["top_a"]: 0, ["top_k"]: 0, seed: -1 });
  const absent = tryImportStChatCompletionPreset({ prompts: [], temperature: 0.8 });
  expect(enabled.ok).toBe(true);
  expect(disabled.ok).toBe(true);
  expect(absent.ok).toBe(true);
  if (!(enabled.ok && disabled.ok && absent.ok)) {
    throw new Error("Sampling preset refused");
  }
  expect(enabled.result.config.params).toEqual({ temperature: 0.8, minP: 0.07, topA: 0.2, topK: 12, seed: 0 });
  expect(enabled.result.dropped).toEqual([]);
  expect(disabled.result.config.params).toEqual({});
  expect(disabled.result.dropped).toEqual([]);
  expect(absent.result.config.params).toEqual({ temperature: 0.8 });
});

test("system squash maps only an enabled preference", () => {
  const enabled = tryImportStChatCompletionPreset({ prompts: [], ["squash_system_messages"]: true });
  const disabled = tryImportStChatCompletionPreset({ prompts: [], ["squash_system_messages"]: false });
  expect(enabled.ok).toBe(true);
  expect(disabled.ok).toBe(true);
  if (!(enabled.ok && disabled.ok)) {
    throw new Error("Squash preset refused");
  }
  expect(enabled.result.config.params.advanced?.squashSystemMessages).toBe(true);
  expect(enabled.result.dropped).toEqual([]);
  expect(disabled.result.config.params).toEqual({});
  expect(disabled.result.dropped).toEqual([]);
});

test("format strings map to their native seats and unsupported group fields report their reasons", () => {
  const outcome = tryImportStChatCompletionPreset({
    prompts: [],
    ["new_chat_prompt"]: "[Start a new Chat]",
    ["impersonation_prompt"]: "speak as the user",
    ["continue_nudge_prompt"]: "keep going",
    ["group_nudge_prompt"]: "poke the group",
    ["new_group_chat_prompt"]: "a fresh group scene",
  });
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  expect(outcome.result.config.formatStrings).toEqual({
    newChatMarker: "[Start a new Chat]",
    impersonateNudge: "speak as the user",
    continueNudge: "keep going",
  });
  expect(outcome.result.dropped).toEqual([
    { field: "group_nudge_prompt", reason: "group nudge is room-owned, not preset-owned" },
    {
      field: "new_group_chat_prompt",
      reason: "orb's one history-START boundary (newChatMarker) is room-agnostic and maps from new_chat_prompt; a group-only boundary has no conditional seat",
    },
  ]);
  const blank = tryImportStChatCompletionPreset({ prompts: [], ["impersonation_prompt"]: "   ", ["continue_nudge_prompt"]: "", ["new_chat_prompt"]: "\n" });
  expect(blank.ok).toBe(true);
  if (!blank.ok) {
    throw new Error(blank.reason);
  }
  expect(blank.result.config.formatStrings).toBeUndefined();
  expect(blank.result.dropped).toEqual([]);
});

test("every field the mapper has a seat for maps with no report, and each one changes the mapped config", () => {
  // SillyTavern wire keys are snake_case by spec. Each value is one the mapper carries, not a default it skips.
  const seated: Readonly<Record<string, unknown>> = {
    temperature: 0.8,
    ["top_p"]: 0.9,
    ["top_k"]: 12,
    ["top_a"]: 0.2,
    ["min_p"]: 0.07,
    ["frequency_penalty"]: 0.3,
    ["presence_penalty"]: 0.4,
    ["repetition_penalty"]: 1.1,
    ["openai_max_tokens"]: 512,
    ["openai_max_context"]: 8192,
    seed: 7,
    ["reasoning_effort"]: "high",
    ["show_thoughts"]: true,
    ["squash_system_messages"]: true,
    ["names_behavior"]: 1,
    ["continue_postfix"]: "\n",
    ["continue_nudge_prompt"]: "keep going",
    ["impersonation_prompt"]: "speak as the user",
    ["new_chat_prompt"]: "[Start a new Chat]",
  };
  const configOf = (preset: Readonly<Record<string, unknown>>): { readonly config: unknown; readonly dropped: readonly string[] } => {
    const outcome = tryImportStChatCompletionPreset({ prompts: [], ...preset });
    if (!outcome.ok) {
      throw new Error(outcome.reason);
    }
    return { config: outcome.result.config, dropped: outcome.result.dropped.map(({ field }) => field) };
  };

  const full = configOf(seated);
  expect(full.dropped).toEqual([]);
  for (const field of Object.keys(seated)) {
    const { [field]: _left, ...without } = seated;
    expect({ field, changed: JSON.stringify(configOf(without).config) !== JSON.stringify(full.config) }).toEqual({ field, changed: true });
  }
});

test("every populated top-level field the mapper neither maps nor lists is named, an empty one is not, and a caller-handled one is left to the caller", () => {
  // SillyTavern wire keys are snake_case by spec; these are fields a public preset carries that orb has no seat for.
  const preset = {
    prompts: [],
    temperature: 0.8,
    ["stream_openai"]: true,
    n: 1,
    ["wi_format"]: "{0}",
    ["max_context_unlocked"]: false,
    ["send_if_empty"]: "",
    ["media_inlining"]: true,
    extensions: { ["regex_scripts"]: [] },
  };
  const fieldsOf = (outcome: ReturnType<typeof tryImportStChatCompletionPreset>): readonly string[] => {
    if (!outcome.ok) {
      throw new Error(outcome.reason);
    }
    return outcome.result.dropped.map(({ field }) => field);
  };

  expect(fieldsOf(tryImportStChatCompletionPreset(preset))).toEqual(["stream_openai", "n", "wi_format", "media_inlining", "extensions"]);
  expect(fieldsOf(tryImportStChatCompletionPreset(preset, { handledFields: ["extensions"] }))).toEqual(["stream_openai", "n", "wi_format", "media_inlining"]);
});

// Every SillyTavern identifier the mapper knows, in a file whose jailbreak sits above the history.
const EVERY_ST_PROMPT = [
  "main",
  "jailbreak",
  "charDescription",
  "charPersonality",
  "scenario",
  "dialogueExamples",
  "personaDescription",
  "worldInfoBefore",
  "chatHistory",
  "worldInfoAfter",
];

function importedOrThrow(raw: unknown): { readonly config: PromptConfig; readonly addedSections: readonly string[] } {
  const outcome = tryImportStChatCompletionPreset(raw);
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  return outcome.result;
}

const markersOf = (config: PromptConfig): readonly string[] => config.sections.map((section) => (section.type === "marker" ? section.marker : section.id));

test("a SillyTavern preset gains a section for every slot it has no prompt for, around its history and never reordering it", () => {
  const result = importedOrThrow({
    prompts: [...EVERY_ST_PROMPT.map((identifier) => ({ identifier })), { identifier: "custom", content: "Stay terse." }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [...EVERY_ST_PROMPT, "custom"].map((identifier) => ({ identifier, enabled: true })) }],
  });
  // Every marker orbweaver has is now in the preset, so a slot added later without an import seat fails here.
  expect(new Set(result.config.sections.flatMap((section) => (section.type === "marker" ? [section.marker] : [])))).toEqual(new Set(MARKER_TYPES));
  // The jailbreak stays above the history where the author put it; only the history anchors the added slots.
  expect(markersOf(result.config)).toEqual([
    "main_prompt",
    "post_history",
    "char_description",
    "char_personality",
    "scenario",
    "dialogue_examples",
    "persona",
    "world_info_before",
    "compact_summary",
    "chat_history",
    "memory",
    "databank",
    "guided_instruction",
    "world_info_after",
    "custom",
  ]);
  const added = result.config.sections.filter((section) => result.addedSections.includes(section.name));
  expect(added).toHaveLength(4);
  for (const section of added) {
    expect(section).toMatchObject({ type: "marker", enabled: true });
    expect("template" in section).toBe(false);
  }
});

test("a SillyTavern preset with no history gets the slot sections at its end", () => {
  const result = importedOrThrow({ prompts: [{ identifier: "main" }, { identifier: "jailbreak" }] });
  expect(markersOf(result.config)).toEqual(["main_prompt", "post_history", "compact_summary", "memory", "databank", "guided_instruction"]);
});

test("a slot section takes a key the author's prompts leave free, and the same file always gets the same keys", () => {
  // A custom SillyTavern prompt may carry any identifier, the shipped slot keys included.
  const file = {
    prompts: [
      { identifier: "memory", content: "The author's own memory note." },
      { identifier: "databank", content: "Theirs too." },
      { identifier: "chatHistory" },
    ],
  };
  const first = importedOrThrow(file);
  const ids = first.config.sections.map((section) => section.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(first.config.sections.filter((section) => section.type === "literal").map(({ id, content }) => ({ id, content }))).toEqual([
    { id: "memory", content: "The author's own memory note." },
    { id: "databank", content: "Theirs too." },
  ]);
  expect(importedOrThrow(file).config).toEqual(first.config);
});
