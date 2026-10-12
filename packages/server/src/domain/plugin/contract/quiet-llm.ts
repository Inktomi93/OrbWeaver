import type { ReadOwnedAssetBytes } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { BindingActor, RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";

export interface PluginQuietLlmDeps {
  readonly roleClientsFor: (funderUserId: UserId, actor?: BindingActor) => Promise<RoleClientsWithSignal>;
  readonly resolveUtilityPresetParams: (userId: UserId) => Promise<SideGenSampling | undefined>;
  readonly assets: { readonly readOwnedAssetBytes: ReadOwnedAssetBytes };
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
}
