// Which preset a Utility-role background task reads (D299), for the user who funds it. It returns only generation
// params, projected through `ROLE_PRESET_FIELDS`: never prompt structure (templates, macros, message handling,
// regex, guided actions) and never chat-only intent, so each background task keeps its own prompt.

import { DEFAULT_PROMPT_CONFIG, rolePresetParamsOf } from "@orb/contracts/preset";
import type { RolePresetChoice } from "@orb/contracts/settings";
import { ROLE_PRESET_CHOICE_KINDS } from "@orb/contracts/settings";
import type { SideGenSampling } from "@orb/inference";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PresetService } from "#domain/preset";
import { PresetNotFoundError } from "#domain/preset";
import type { SettingsService } from "#domain/settings";

/** A user's Utility-role preset params from `seeds.summarizePreset`: absent is task defaults (`undefined`, the
 *  task posture alone); `same-as-chat` follows the active preset (the built-in when unset); `preset` names one.
 *  A stale, unowned or missing named preset degrades to task defaults. */
type ResolveUtilityPresetParams = (userId: UserId) => Promise<SideGenSampling | undefined>;

export interface SideGenParamsDeps {
  readonly preset: Pick<PresetService, "get">;
  readonly settings: Pick<SettingsService, "loadUserSettings">;
}

export function buildSideGenParams(deps: SideGenParamsDeps): { readonly resolveUtilityPresetParams: ResolveUtilityPresetParams } {
  // `null` from a stale/unowned/missing id. A database/I/O/program failure must surface, not silently replace the
  // caller's configured sampling (#759).
  const presetParams = async (userId: UserId, presetId: PresetId): Promise<SideGenSampling | null> => {
    try {
      return rolePresetParamsOf((await deps.preset.get({ userId, id: presetId })).config.params);
    } catch (err) {
      if (err instanceof PresetNotFoundError) {
        return null;
      }
      throw err;
    }
  };

  const fromChoice = async (userId: UserId, choice: RolePresetChoice, activePresetId: string | null): Promise<SideGenSampling | undefined> => {
    if (choice.kind === ROLE_PRESET_CHOICE_KINDS.preset) {
      return (await presetParams(userId, castId<PresetId>(choice.presetId))) ?? undefined;
    }
    // Same as chat: the active preset, which falls back to the built-in exactly as a chat turn does.
    const active = activePresetId === null ? null : await presetParams(userId, castId<PresetId>(activePresetId));
    return active ?? rolePresetParamsOf(DEFAULT_PROMPT_CONFIG.params);
  };

  const resolveUtilityPresetParams: ResolveUtilityPresetParams = async (userId) => {
    const { seeds } = await deps.settings.loadUserSettings(userId);
    return seeds.summarizePreset === null ? undefined : fromChoice(userId, seeds.summarizePreset, seeds.defaultPresetId);
  };

  return { resolveUtilityPresetParams };
}
