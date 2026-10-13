import type { UserSettings } from "@orb/contracts/settings";
import type { SideGenSampling } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { PresetService } from "./service.ts";

export type ResolveUtilityPresetParams = (userId: UserId) => Promise<SideGenSampling | undefined>;
export interface SideGenParamsDeps {
  readonly preset: Pick<PresetService, "get">;
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
}
export interface SideGenParams {
  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;
}
