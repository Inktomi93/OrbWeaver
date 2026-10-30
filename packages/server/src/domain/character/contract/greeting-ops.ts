// Character owns greeting selection and completion; settings and preset supply only their canonical values.

import type { ReadOptionalPresetConfig, ResolveUtilityPresetParams } from "@orb/contracts/preset";
import type { ReadDefaultPresetId } from "@orb/contracts/settings";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";

export interface GreetingTemplateDeps {
  readonly readDefaultPresetId: ReadDefaultPresetId;
  readonly readPresetConfig: ReadOptionalPresetConfig;
}
export interface GreetingCompletionDeps {
  readonly roleClientsFor: (userId: UserId) => Promise<Pick<RoleClientsWithSignal, "summarize">>;
  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;
}
