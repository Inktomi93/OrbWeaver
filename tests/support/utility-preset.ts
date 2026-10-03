// A Utility-role preset resolver (D299) over one preset that carries prompt structure as well as sampling: a
// custom main-prompt template beside the given `params`. Tests bind it to prove a background task takes only the
// preset's generation params while its own prompt stays unchanged.

import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, PROMPT_CONFIG_SCHEMA_VERSION } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS, ROLE_PRESET_CHOICE_KINDS } from "@orb/contracts/settings";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PresetDetail } from "../../packages/server/src/domain/preset/contract/views.ts";
import { buildSideGenParams } from "../../packages/server/src/entry/compose/side-gen-params.ts";

export const CUSTOM_SYSTEM_TEMPLATE = "CUSTOM PRESET SYSTEM TEMPLATE — never a background prompt";

const FROZEN_AT = 1_700_000_000_000;

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

/** A readable preset row carrying `config`. */
export function presetDetail(config: PromptConfig): PresetDetail {
  return {
    id: mintTypeId(ID_PREFIX.preset),
    name: "Structured utility",
    kind: "chat",
    isSystemDefault: false,
    forkedFrom: null,
    configUnreadable: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
    config,
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
  };
}

/** The resolver a user whose Utility role names that preset gets. */
export function utilityPresetResolver(params: UserIntent): ReturnType<typeof buildSideGenParams>["resolveUtilityPresetParams"] {
  const detail = presetDetail(presetWithPromptStructure(params));
  const id = detail.id;
  return buildSideGenParams({
    preset: { get: () => Promise.resolve(detail) },
    settings: {
      loadUserSettings: () =>
        Promise.resolve({
          ...DEFAULT_USER_SETTINGS,
          seeds: { ...DEFAULT_USER_SETTINGS.seeds, summarizePreset: { kind: ROLE_PRESET_CHOICE_KINDS.preset, presetId: id } },
        }),
    },
  }).resolveUtilityPresetParams;
}
