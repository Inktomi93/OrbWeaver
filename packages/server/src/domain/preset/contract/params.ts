// Every verb's input shape, declared once (the contract is the one type home, §7.4). preset is
// user-scoped: each verb carries the `userId` resolved from the request `Principal` — never a `users`
// join (the no-direct-users-read chokepoint). `config` is the cross-boundary `PromptConfig` from
// `@orb/contracts/preset`, consumed here, never re-declared. No `principal` field and no guard op:
// preset has one owner per row and gates by `ownerId === userId`, so there's nothing for an `admin`
// guard to arbitrate.

import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId, UserId } from "@orb/kit/ids";

/** `create` input: the owner + the authored config (defaults to `DEFAULT_PROMPT_CONFIG` when omitted). */
export interface CreatePresetParams {
  readonly userId: UserId;
  readonly name: string;
  readonly kind: string;
  readonly config?: PromptConfig;
}

/** `list` input: the owner whose library (plus the shared system default) is returned. */
export interface ListPresetsParams {
  readonly userId: UserId;
}

/** `get` input: read one preset readable by this owner (their own row OR the system default). */
export interface GetPresetParams {
  readonly userId: UserId;
  readonly id: PresetId;
}

/** `update` input: a partial patch over an owned preset. Targeting `SYSTEM_DEFAULT_PRESET_ID` triggers
 *  copy-on-write — a new owned fork is created from the submission and its NEW id is returned.
 *  Omitted fields are left unchanged. */
export interface UpdatePresetParams {
  readonly userId: UserId;
  readonly id: PresetId;
  readonly name?: string;
  readonly kind?: string;
  readonly config?: PromptConfig;
}

/** `remove` input: delete an owned preset (the system default is guarded — never removable). */
export interface RemovePresetParams {
  readonly userId: UserId;
  readonly id: PresetId;
}

/** `resetToDefault` input: replace an owned preset's config with `DEFAULT_PROMPT_CONFIG`. */
export interface ResetToDefaultParams {
  readonly userId: UserId;
  readonly id: PresetId;
}
