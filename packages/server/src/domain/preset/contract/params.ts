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

/** Land the submission on the caller's EXISTING fork of the source (minting one only when there is none) —
 *  the historical copy-on-write behavior, and what an absent intent means. It stays the back-compat arm AND
 *  the race backstop: a client that never surfaces the choice, and a second tab that raced the first, both
 *  converge on one fork instead of stacking rows. */
interface ConvergeForkIntent {
  readonly mode: "converge";
}

/** Mint a SECOND (third, …) fork of the source under `name` — the owner explicitly chose "start a new fork"
 *  over editing the fork they already have. Always mints: the non-unique `(owner_id, forked_from)` index is
 *  what permits N forks per source (db/schema/preset.ts), so two concurrent "new" intents legitimately
 *  produce two forks. */
interface NewForkIntent {
  readonly mode: "new";
  readonly name: string;
}

/** How a copy-on-write of the system default resolves. The CLIENT decides — it knows whether the owner
 *  already has a fork and can ask them (`features/preset/hooks/use-preset-autosave.ts`). */
export type PresetForkIntent = ConvergeForkIntent | NewForkIntent;

/** Targeting SYSTEM_DEFAULT_PRESET_ID triggers copy-on-write — a new owned fork is created and its new id
 *  returned. `fork` picks WHICH fork carries the submission; absent = `converge`. */
export interface UpdatePresetParams {
  readonly userId: UserId;
  readonly id: PresetId;
  readonly name?: string;
  readonly kind?: string;
  readonly config?: PromptConfig;
  readonly fork?: PresetForkIntent;
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
