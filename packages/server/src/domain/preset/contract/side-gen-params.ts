import type { ResolveUtilityPresetParams } from "@orb/contracts/preset";
import type { UserSettings } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { PresetService } from "./service.ts";

export interface SideGenParamsDeps {
  readonly preset: Pick<PresetService, "get">;
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
}
export interface SideGenParams {
  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;
}
