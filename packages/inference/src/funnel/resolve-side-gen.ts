// The pure fold for a side-generation call's sampling (D299). A non-chat role contributes only its preset's
// generation params (`ROLE_PRESET_FIELDS`), never prompt structure or chat-only intent; both inputs are projected
// here, so a caller that hands in a whole `UserIntent` cannot leak a chat-only field.

import type { UserIntent } from "@orb/contracts/preset";
import { rolePresetParamsOf } from "@orb/contracts/preset";
import type { SideGenSampling } from "../contract/side-gen.ts";

/** Fold `presetParams` (the role's preset params, absent under task defaults) over `posture`
 *  (`SIDE_GEN_POSTURES`): a knob the preset sets wins, the posture fills only the knobs it leaves unset, and a
 *  knob absent from both stays absent so the backend default stands. */
export function resolveSideGenSampling(posture: UserIntent, presetParams?: UserIntent | undefined): SideGenSampling {
  return { ...rolePresetParamsOf(posture), ...rolePresetParamsOf(presetParams ?? {}) };
}
