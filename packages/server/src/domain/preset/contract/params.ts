// Every verb's input shape, declared once. preset is user-scoped: each verb carries the userId resolved
// from the request Principal, never a users join. No principal field and no guard op — preset has one
// owner per row and gates by ownerId === userId.

import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId, UserId } from "@orb/kit/ids";
import type { PackagedPresetKey } from "./packaged";

export interface CreatePresetParams {
  readonly userId: UserId;
  readonly name: string;
  readonly kind: string;
  readonly config?: PromptConfig;
}

export interface ListPresetsParams {
  readonly userId: UserId;
}

export interface GetPresetParams {
  readonly userId: UserId;
  readonly id: PresetId;
}

/** Targeting SYSTEM_DEFAULT_PRESET_ID triggers copy-on-write — a new owned fork is created and its new id returned. */
export interface UpdatePresetParams {
  readonly userId: UserId;
  readonly id: PresetId;
  readonly name?: string;
  readonly kind?: string;
  readonly config?: PromptConfig;
}

export interface RemovePresetParams {
  readonly userId: UserId;
  readonly id: PresetId;
}

/** Clone a packaged template preset into the caller's library. `key` selects the shipped template; the new
 *  owned copy carries a fresh id (returned in the detail). */
export interface ClonePackagedParams {
  readonly userId: UserId;
  readonly key: PackagedPresetKey;
}

export interface ResetToDefaultParams {
  readonly userId: UserId;
  readonly id: PresetId;
}
