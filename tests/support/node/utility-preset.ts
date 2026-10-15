// A Utility-role preset resolver (D299) over one preset that carries prompt structure as well as sampling: a
// custom main-prompt template beside the given `params`. Tests bind it to prove a background task takes only the
// preset's generation params while its own prompt stays unchanged.

import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, PROMPT_CONFIG_SCHEMA_VERSION, presetDetailSchema } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS, ROLE_PRESET_CHOICE_KINDS } from "@orb/contracts/settings";
import type { IdSource } from "@orb/kit/ids";
import { buildSideGenParams } from "@orb/server/domain/preset";
import { makePresetDetail } from "./factories/preset-view.ts";

export const CUSTOM_SYSTEM_TEMPLATE = "CUSTOM PRESET SYSTEM TEMPLATE — never a background prompt";

/** The built-in arrangement with its main prompt replaced, carrying `params`. */
export function presetWithPromptStructure(params: UserIntent): PromptConfig {
  return {
    ...DEFAULT_PROMPT_CONFIG,
    sections: DEFAULT_PROMPT_CONFIG.sections.map((section) =>
      section.type === "marker" && section.marker === "main_prompt" ? { ...section, template: CUSTOM_SYSTEM_TEMPLATE } : section,
    ),
    params,
  };
}

/** The resolver a user whose Utility role names that preset gets. */
export function utilityPresetResolver(params: UserIntent, source?: IdSource): ReturnType<typeof buildSideGenParams>["resolveUtilityPresetParams"] {
  const detail = presetDetailSchema.parse(
    makePresetDetail(
      {
        name: "Structured utility",
        kind: "chat",
        config: presetWithPromptStructure(params),
        schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
      },
      source,
    ),
  );
  const id = detail.id;
  return buildSideGenParams({
    preset: { get: () => Promise.resolve(detail) },
    loadUserSettings: () =>
      Promise.resolve({
        ...DEFAULT_USER_SETTINGS,
        seeds: { ...DEFAULT_USER_SETTINGS.seeds, summarizePreset: { kind: ROLE_PRESET_CHOICE_KINDS.preset, presetId: id } },
      }),
  }).resolveUtilityPresetParams;
}
