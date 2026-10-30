import type { ResolveUtilityPresetParams } from "@orb/contracts/preset";
import type { LoadUserSettings } from "@orb/contracts/settings";
import type { PresetService } from "./service.ts";

export interface SideGenParamsDeps {
  readonly preset: Pick<PresetService, "get">;
  readonly loadUserSettings: LoadUserSettings;
}
export interface SideGenParams {
  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;
}
