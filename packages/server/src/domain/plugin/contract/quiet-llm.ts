import type { ReadOwnedAssetBytes } from "@orb/contracts/assets";
import type { ResolveHostPrincipalOp } from "@orb/contracts/identity";
import type { ResolveUtilityPresetParams } from "@orb/contracts/preset";
import type { BindingActor, RoleClientsWithSignal } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";

export interface PluginQuietLlmDeps {
  readonly roleClientsFor: (funderUserId: UserId, actor?: BindingActor) => Promise<RoleClientsWithSignal>;
  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;
  readonly assets: { readonly readOwnedAssetBytes: ReadOwnedAssetBytes };
  readonly resolveOwnerPrincipal: ResolveHostPrincipalOp;
}
