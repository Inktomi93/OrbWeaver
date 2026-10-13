// Which preset a Utility-role background task reads (D304), for the user who funds it. It returns generation
// params, projected through `ROLE_PRESET_FIELDS`, and the preset's inline reasoning tag pair: never other prompt
// structure (templates, macros, message handling, regex, guided actions) and never chat-only intent.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, rolePresetParamsOf } from "@orb/contracts/preset";
import type { RolePresetChoice } from "@orb/contracts/settings";
import { ROLE_PRESET_CHOICE_KINDS } from "@orb/contracts/settings";
import type { SideGenSampling } from "@orb/inference";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ResolveUtilityPresetParams, SideGenParams, SideGenParamsDeps } from "../contract/side-gen-params.ts";
import { createLoadOptionalPreset } from "../substrate/optional-read.ts";

/** A preset's role params, with its `reasoningParse` pair where auto-parse is on: an off pair is inert in chat, so a
 *  background task keeps the house pair. */
function rolePresetOf(config: PromptConfig): SideGenSampling {
  const pair = config.reasoningParse?.autoParse === true ? config.reasoningParse : undefined;
  return rolePresetParamsOf({ ...config.params, ...(pair !== undefined ? { reasoningTags: { prefix: pair.prefix, suffix: pair.suffix } } : {}) });
}

export function buildSideGenParams(deps: SideGenParamsDeps): SideGenParams {
  // `null` from a stale/unowned/missing id. A database/I/O/program failure must surface, not silently replace the
  // caller's configured sampling (#759).
  const loadOptional = createLoadOptionalPreset((args) => deps.preset.get(args));
  const presetParams = async (userId: UserId, presetId: PresetId): Promise<SideGenSampling | null> => {
    const detail = await loadOptional(userId, presetId);
    return detail === null ? null : rolePresetOf(detail.config);
  };

  const fromChoice = async (userId: UserId, choice: RolePresetChoice, activePresetId: string | null): Promise<SideGenSampling | undefined> => {
    if (choice.kind === ROLE_PRESET_CHOICE_KINDS.preset) {
      return (await presetParams(userId, castId<PresetId>(choice.presetId))) ?? undefined;
    }
    // Same as chat: the active preset, which falls back to the built-in exactly as a chat turn does.
    const active = activePresetId === null ? null : await presetParams(userId, castId<PresetId>(activePresetId));
    return active ?? rolePresetOf(DEFAULT_PROMPT_CONFIG);
  };

  const resolveUtilityPresetParams: ResolveUtilityPresetParams = async (userId) => {
    const { seeds } = await deps.loadUserSettings(userId);
    return seeds.summarizePreset === null ? undefined : fromChoice(userId, seeds.summarizePreset, seeds.defaultPresetId);
  };

  return { resolveUtilityPresetParams };
}
