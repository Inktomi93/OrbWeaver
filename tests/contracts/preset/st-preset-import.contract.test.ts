import { buildPresetFile, DEFAULT_PROMPT_CONFIG, parsePresetFile, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import { expect, test } from "@orb/testkit/node";

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
    expect(config.sections).toEqual([
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
    expect(dropped).toEqual(
      depth === MAX_INJECTION_DEPTH ? [] : [{ field: "prompts.a.injection_depth", reason: expect.stringContaining(`SillyTavern sent ${depth};`) }],
    );
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
  expect(config.sections).toEqual([
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
  expect(unset.result.config.sections).toStrictEqual([
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
