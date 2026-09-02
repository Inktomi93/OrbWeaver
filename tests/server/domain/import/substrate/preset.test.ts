// substrate/preset — the ST chat-completion preset parser. Pins: the qualified name rule (never overwrites
// an owner's own same-named preset), an unrecognizable object is null, unmapped `extensions.*` fields are
// reported by name (never silently dropped), and `extensions.regex_scripts` parses into RegexScriptCard[]
// while a malformed script joins `unmapped` rather than aborting the whole preset.

import { describe } from "vitest";
import { parseStPresetFile, parseStSettingsPreset, stPresetFromJson, stPresetName } from "../../../../../packages/server/src/domain/import/substrate/preset.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function stPresetJson(over: Record<string, unknown> = {}): unknown {
  return {
    temperature: 1,
    // biome-ignore-start lint/style/useNamingConvention: ST preset wire field names (snake_case) are the interchange format.
    openai_max_tokens: 1200,
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "main", enabled: true }] }],
    prompts: [{ identifier: "main", name: "| Prompt", system_prompt: true, role: "system", content: "You are a storyteller." }],
    // biome-ignore-end lint/style/useNamingConvention: end of the block above
    ...over,
  };
}

describe("stPresetName", () => {
  test("qualifies the stem so a collision never overwrites an owner's own same-named preset", () => {
    expect(stPresetName("Default")).toBe("Default (OpenAI)");
  });
});

describe("stPresetFromJson", () => {
  test("an unrecognizable object (no prompts/prompt_order shape) is null, never throws", () => {
    expect(stPresetFromJson({ foo: "bar" }, "x")).toBeNull();
    expect(stPresetFromJson("not an object", "x")).toBeNull();
  });

  test("a well-formed preset maps through and unmapped extension fields are reported by name", () => {
    // biome-ignore lint/style/useNamingConvention: ST preset wire field names (snake_case) are the interchange format.
    const raw = stPresetJson({ extensions: { some_unmapped_key: 1 } });
    const result = stPresetFromJson(raw, "Marinara");
    expect(result).not.toBeNull();
    expect(result?.unmapped.some((u) => u.field === "extensions.some_unmapped_key")).toBe(true);
  });

  test("extensions.regex_scripts parses valid entries; a malformed one joins unmapped, never aborts the preset", () => {
    const raw = stPresetJson({
      extensions: {
        // biome-ignore lint/style/useNamingConvention: ST preset wire field names (snake_case) are the interchange format.
        regex_scripts: [
          {
            id: "2f5b7243-6200-4263-9a37-c71dcea01e70",
            scriptName: "Fix quotes",
            findRegex: '"',
            replaceString: "'",
            trimStrings: [],
            placement: [1],
            disabled: false,
            markdownOnly: false,
            promptOnly: false,
            runOnEdit: false,
            substituteRegex: 0,
          },
          { not: "a valid script" },
        ],
      },
    });
    const result = stPresetFromJson(raw, "Marinara");
    expect(result).not.toBeNull();
    expect(result?.regexScripts).toHaveLength(1);
    expect(result?.unmapped.some((u) => u.field === "extensions.regex_scripts[1]")).toBe(true);
  });
});

describe("parseStPresetFile", () => {
  test("unparseable JSON bytes degrade to null, never throw", () => {
    expect(() => parseStPresetFile(new TextEncoder().encode("{broken"), "stem")).not.toThrow();
    expect(parseStPresetFile(new TextEncoder().encode("{broken"), "stem")).toBeNull();
  });

  test("a valid preset file names itself via stPresetName(stem)", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(stPresetJson()));
    const result = parseStPresetFile(bytes, "MyPreset");
    expect(result?.name).toBe("MyPreset (OpenAI)");
  });
});

describe("parseStSettingsPreset", () => {
  test("a non-object settings blob is null", () => {
    expect(parseStSettingsPreset("nope")).toBeNull();
  });

  test("the live oai_settings section parses with the ST_ACTIVE_PRESET_NAME, carrying power_user through", () => {
    // biome-ignore lint/style/useNamingConvention: ST preset wire field names (snake_case) are the interchange format.
    const settings = { oai_settings: stPresetJson(), power_user: { max_context: 8192 } };
    const result = parseStSettingsPreset(settings);
    expect(result?.name).toBe("OpenAI (active)");
  });
});
