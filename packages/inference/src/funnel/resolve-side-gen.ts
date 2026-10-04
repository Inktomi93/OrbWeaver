// The pure fold for a side-generation call's sampling (D299). A non-chat role contributes its preset's generation
// params (`ROLE_PRESET_FIELDS`) and inline reasoning tag pair, never other prompt structure or chat-only intent;
// both inputs are projected here, so a caller that hands in a whole `UserIntent` cannot leak a chat-only field.

import type { RolePresetParams, UserIntent } from "@orb/contracts/preset";
import { rolePresetParamsOf } from "@orb/contracts/preset";
import type { SideGenSampling } from "../contract/side-gen.ts";

/** Fold `presetParams` (the role's preset params, absent under task defaults) over `posture`
 *  (`SIDE_GEN_POSTURES`): a knob the preset sets wins, the posture fills only the knobs it leaves unset, and a
 *  knob absent from both stays absent so the backend default stands. Effort and the thinking budget are one
 *  reasoning choice: a preset that sets either keeps the posture's effort floor out, so its budget is not
 *  overruled by an effort it never chose. */
export function resolveSideGenSampling(
  posture: UserIntent,
  presetParams?: (UserIntent & Pick<RolePresetParams, "reasoningTags">) | undefined,
): SideGenSampling {
  const preset = rolePresetParamsOf(presetParams ?? {});
  const { effort, ...rest } = rolePresetParamsOf(posture);
  const presetReasons = preset.effort !== undefined || preset.thinkingBudgetTokens !== undefined;
  return { ...rest, ...(effort !== undefined && !presetReasons ? { effort } : {}), ...preset };
}
