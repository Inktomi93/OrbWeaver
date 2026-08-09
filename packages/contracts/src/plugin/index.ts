// @orb/contracts/plugin — the guest↔host wire vocabulary for the D46 code sandbox (plugin-design set). The
// membrane a guest sees (`PluginHostV1` + opaque handles + supporting projections — host-v1.ts, 01 §2), the
// install-time manifest + capability axis (manifest.ts, 02 §1), the capability→function completeness map, and
// the two guest-observable membrane errors (errors.ts, 01 §2/§3). The runtime lives in `infra/plugin-host`
// (P1, landed); the registry/lifecycle/grants lives in `domain/plugin` (P3). This node imports nothing above
// contracts (the package cake) and is the ONE home for these shapes — P3/P4 derive, never re-spell.

/** The `plugin.getLog` page CEILING, enforced at the transport trust boundary (the `CHARACTER_LIST_MAX_LIMIT`
 *  precedent) — a plugin's execution log is a growing per-plugin catalog, so an over-bound ask is a
 *  BAD_REQUEST rather than an unbounded log fetch (the #45 class). */
export const PLUGIN_LOG_LIST_MAX_LIMIT = 500;

export type { InvocationChat, PluginBridge } from "./bridge.ts";
export { HostVersionError, PluginCapabilityError } from "./errors.ts";
export type {
  ChatHandle,
  HostFunctionRef,
  PluginHostV1,
  PluginInvocation,
  PluginLogLevel,
  PluginMessageView,
  PluginVariableOp,
  PluginWorldEntryUpsert,
} from "./host-v1.ts";
export { HOST_FUNCTION_CAPABILITY, PLUGIN_LOG_LEVELS } from "./host-v1.ts";
export type { PluginOrigin, PluginStatus } from "./lifecycle.ts";
export { PLUGIN_ORIGINS, PLUGIN_STATUSES } from "./lifecycle.ts";
export type { PluginBuiltAgainst, PluginCapability, PluginManifest } from "./manifest.ts";
export { PLUGIN_CAPABILITIES, pluginBuiltAgainstSchema, pluginManifestSchema } from "./manifest.ts";
export type {
  PluginEventSubscription,
  PluginHandlerRef,
  PluginInstance,
  PluginToolRegistration,
  PluginTransformRegistration,
} from "./registrations.ts";
