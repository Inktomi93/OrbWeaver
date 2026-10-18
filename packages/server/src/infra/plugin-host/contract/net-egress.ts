import type { PluginHostV1, PluginInvocationLiveness } from "@orb/contracts/plugin";

/** The membrane's egress seam. `init` is the guest's raw (already dumped) request init; only GET/POST, a
 *  string-valued header map and a string body survive into the request. */
export interface PluginNetEgress {
  readonly fetch: (url: string, init: unknown, liveness: PluginInvocationLiveness) => Promise<PluginNetResponse>;
  readonly fetchAsset: (
    url: string,
    liveness: PluginInvocationLiveness,
  ) => Promise<{
    // eslint-disable-next-line orb/brand-in-name-position -- the plugin SANDBOX wire DTO — a host-minted id for the installer's own new asset; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
    readonly assetId: string;
  }>;
}

/** The guest's canonical net.fetch result, exposed read-only inside the adapter. */
export type PluginNetResponse = Readonly<Awaited<ReturnType<PluginHostV1["net"]["fetch"]>>>;
