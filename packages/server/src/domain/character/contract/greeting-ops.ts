// Character owns greeting selection and completion; settings and preset supply only their canonical values.

import type { Principal } from "@orb/contracts/identity";
import type { PromptConfig } from "@orb/contracts/preset";
import type { UserSettings } from "@orb/contracts/settings";
import type { RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import type { PresetId, UserId } from "@orb/kit/ids";

export interface GreetingTemplateDeps {
  readonly readDefaultPresetId: (caller: Principal) => Promise<UserSettings["seeds"]["defaultPresetId"]>;
  readonly readPresetConfig: (userId: UserId, id: PresetId) => Promise<PromptConfig | null>;
}
export interface GreetingCompletionDeps {
  readonly roleClientsFor: (userId: UserId) => Promise<Pick<RoleClientsWithSignal, "summarize">>;
  readonly resolveUtilityPresetParams: (userId: UserId) => Promise<SideGenSampling | undefined>;
}
