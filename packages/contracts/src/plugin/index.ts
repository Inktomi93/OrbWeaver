// @orb/contracts/plugin — the guest↔host wire vocabulary for the D46 code sandbox. The
// membrane a guest sees (`PluginHostV1` + opaque handles + supporting projections — host-v1.ts), the
// install-time manifest + capability axis (manifest.ts), the capability→function completeness map, and
// the two guest-observable membrane errors (errors.ts). The runtime lives in `infra/plugin-host`
// (landed); the registry/lifecycle/grants lives in `domain/plugin`. This node imports nothing above
// contracts (the package cake) and is the ONE home for these shapes — the domain derives, never re-spells.

/** The `plugin.getLog` page CEILING, enforced at the transport trust boundary (the `CHARACTER_LIST_MAX_LIMIT`
 *  precedent) — a plugin's execution log is a growing per-plugin catalog, so an over-bound ask is a
 *  BAD_REQUEST rather than an unbounded log fetch (the #45 class). */
export const PLUGIN_LOG_LIST_MAX_LIMIT = 500;

export type { InvocationChat, PluginBridge, PluginInvocationLiveness } from "./bridge.ts";
export { HostVersionError, PluginCapabilityError, PluginSuggestedError } from "./errors.ts";
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
export { NET_HOSTS_MAX, PLUGIN_CAPABILITIES, pluginBuiltAgainstSchema, pluginManifestSchema, pluginNetHostSchema, pluginSlugSchema } from "./manifest.ts";
export type {
  PluginEventSubscription,
  PluginHandlerRef,
  PluginInstance,
  PluginSurfaceRegistration,
  PluginToolRegistration,
  PluginTransformRegistration,
} from "./registrations.ts";
export type { PluginSuggestedAct, PluginSuggestedActKind } from "./suggestion.ts";
export { PLUGIN_SUGGESTED_ACT_KINDS, summarizePluginAct } from "./suggestion.ts";
export type {
  PluginBadgeIntent,
  PluginBadgeNode,
  PluginBoundNumber,
  PluginBoundString,
  PluginButtonNode,
  PluginButtonVariant,
  PluginConfirmButtonNode,
  PluginGapToken,
  PluginImageNode,
  PluginKeyValueNode,
  PluginKeyValueRow,
  PluginListNode,
  PluginMarkdownNode,
  PluginMeterNode,
  PluginNodeKind,
  PluginNumberFieldNode,
  PluginRowNode,
  PluginSectionNode,
  PluginSelectNode,
  PluginSelectOption,
  PluginSliderNode,
  PluginStackNode,
  PluginStateBinding,
  PluginSurfaceAnchor,
  PluginSurfaceNode,
  PluginSurfaceRegistrationMeta,
  PluginSurfaceSpec,
  PluginSurfaceTier,
  PluginTextFieldNode,
  PluginTextNode,
  PluginTextVoice,
  PluginToggleNode,
} from "./ui.ts";
export {
  PLUGIN_BADGE_INTENTS,
  PLUGIN_BUTTON_VARIANTS,
  PLUGIN_GAP_TOKENS,
  PLUGIN_NODE_KINDS,
  PLUGIN_ROWS_MAX,
  PLUGIN_SPEC_MAX_BYTES,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SPEC_MAX_NODES,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_ID_RE,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_SURFACE_TITLE_MAX,
  PLUGIN_TEXT_MAX_BYTES,
  PLUGIN_TEXT_VOICES,
  pluginSurfaceNodeSchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
} from "./ui.ts";
