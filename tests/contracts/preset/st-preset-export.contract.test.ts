// A config written as a SillyTavern chat-completion preset reads back to the same config through the preset import,
// carries the preset's regex scripts where SillyTavern keeps them, holds no field SillyTavern's import warns about,
// and names every config field the file cannot carry.
// @subject packages/contracts/src/preset/index.ts

import { exportStChatCompletionPreset, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node";

// SillyTavern's chat-completion preset with markers, an injected literal with a trigger, samplers and the nudges.
const ST_PRESET = {
  prompts: [
    { identifier: "main", name: "Main Prompt", role: "system", content: "You narrate {{char}}.", ["system_prompt"]: true },
    { identifier: "worldInfoBefore", name: "World Info (before)", ["system_prompt"]: true, marker: true },
    { identifier: "chatHistory", name: "Chat History", ["system_prompt"]: true, marker: true },
    {
      identifier: "aside",
      name: "Aside",
      role: "user",
      content: "Stay in scene.",
      ["injection_position"]: 1,
      ["injection_depth"]: 2,
      ["injection_order"]: 50,
      ["injection_trigger"]: ["normal"],
    },
    { identifier: "jailbreak", name: "Post-History Instructions", role: "system", content: "Keep it short.", ["system_prompt"]: true },
  ],
  ["prompt_order"]: [
    {
      ["character_id"]: 100_001,
      order: [
        { identifier: "main", enabled: true },
        { identifier: "worldInfoBefore", enabled: true },
        { identifier: "chatHistory", enabled: true },
        { identifier: "aside", enabled: false },
        { identifier: "jailbreak", enabled: true },
      ],
    },
  ],
  temperature: 0.9,
  ["top_p"]: 0.95,
  ["top_k"]: 40,
  ["openai_max_tokens"]: 600,
  ["names_behavior"]: 2,
  ["continue_postfix"]: " ",
  ["continue_nudge_prompt"]: "Go on.",
  ["impersonation_prompt"]: "Write as {{user}}.",
};

// SillyTavern's preset import warns on and strips these (`public/scripts/openai.js:288` `sensitiveFields`).
const ST_SENSITIVE_FIELDS = ["reverse_proxy", "proxy_password", "custom_url", "custom_include_body", "custom_exclude_body", "custom_include_headers"];

function imported(raw: unknown): Extract<ReturnType<typeof tryImportStChatCompletionPreset>, { ok: true }>["result"] {
  const outcome = tryImportStChatCompletionPreset(raw);
  if (!outcome.ok) {
    throw new Error(JSON.stringify(outcome));
  }
  return outcome.result;
}

test("a config exported as a SillyTavern preset imports back to the same config", () => {
  const first = imported(ST_PRESET);

  const { preset, left } = exportStChatCompletionPreset(first.config);
  const second = imported(JSON.parse(JSON.stringify(preset)));

  expect(second.config).toEqual(first.config);
  expect(second.dropped).toEqual([]);
  expect(left).toEqual([]);
  expect(Object.keys(preset).filter((field) => ST_SENSITIVE_FIELDS.includes(field))).toEqual([]);
});

test("the preset's regex scripts ride where SillyTavern keeps preset scripts", () => {
  const script = { id: "c0ffee00-0000-4000-8000-000000000001", scriptName: "Whistle", findRegex: "sings", replaceString: "whistles" };

  const { preset } = exportStChatCompletionPreset(imported(ST_PRESET).config, [script]);

  expect(preset["extensions"]).toEqual({ ["regex_scripts"]: [script] });
});

test("a config field a SillyTavern preset file has no place for is named, not dropped", () => {
  const { config } = imported(ST_PRESET);

  const { left } = exportStChatCompletionPreset({
    ...config,
    params: { ...config.params, stop: ["\n\n"] },
    postProcess: { collapseNewlines: true, dropIncompleteSentence: false, trimTrailingWhitespace: false, singleLine: false },
  });

  expect(left.map(({ field }) => field)).toEqual(["params.stop", "postProcess"]);
});
