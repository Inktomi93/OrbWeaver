import type { PluginHostV1, PluginInvocationLiveness } from "@orb/contracts/plugin";
import type { AssetId, SandboxWireId } from "@orb/kit/ids";

/** The membrane's egress seam. `init` is the guest's raw (already dumped) request init; only GET/POST, a
 *  string-valued header map and a string body survive into the request. */
export interface PluginNetEgress {
  readonly fetch: (url: string, init: unknown, liveness: PluginInvocationLiveness) => Promise<PluginNetResponse>;
  readonly fetchAsset: (
    url: string,
    liveness: PluginInvocationLiveness,
  ) => Promise<{
    readonly assetId: SandboxWireId<AssetId>;
  }>;
}

/** The guest's canonical net.fetch result, exposed read-only inside the adapter. */
export type PluginNetResponse = Readonly<Awaited<ReturnType<PluginHostV1["net"]["fetch"]>>>;
