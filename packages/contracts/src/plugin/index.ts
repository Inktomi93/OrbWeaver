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

/** The `plugin.transformForDisplay` input CEILING (plugin-ui-plane seam 14, U6) — the longest rendered row a
 *  viewer's client may submit for display transformation, enforced at the transport trust boundary. It is
 *  generous against real prose (a very long message is a few thousand characters) and it exists because the
 *  round-trip is PER ROW: without it a transcript render is an unbounded upload per visible message. A row over
 *  the cap is a BAD_REQUEST, and the client's fallback is the text it already has — the same degrade a skipped
 *  transform produces, so an over-long row renders un-annotated rather than not at all. */
export const PLUGIN_DISPLAY_TEXT_MAX_CHARS = 32_000;

export type { InvocationChat, PluginBridge, PluginInvocationLiveness } from "./bridge.ts";
export { HostVersionError, PluginCapabilityError, PluginSuggestedError } from "./errors.ts";
export type {
  ChatHandle,
  HostFunctionRef,
  PluginHostV1,
  PluginInvocation,
  PluginLogLevel,
  PluginMessageView,
  PluginQuietOptions,
  PluginQuietSchema,
  PluginVariableOp,
  PluginWorldEntryUpsert,
  UiProxyableHostFunction,
} from "./host-v1.ts";
export { HOST_FUNCTION_CAPABILITY, isUiProxyableHostFunction, PLUGIN_LOG_LEVELS, PLUGIN_QUIET_IMAGES_MAX, UI_PROXYABLE_HOST_FUNCTIONS } from "./host-v1.ts";
export type { PluginOrigin, PluginStatus } from "./lifecycle.ts";
export { PLUGIN_ORIGINS, PLUGIN_STATUSES } from "./lifecycle.ts";
export type { PluginBuiltAgainst, PluginCapability, PluginManifest } from "./manifest.ts";
export {
  NET_HOSTS_MAX,
  PLUGIN_CAPABILITIES,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_MANIFEST_ENTRY,
  PLUGIN_UI_ENTRY,
  pluginBuiltAgainstSchema,
  pluginManifestSchema,
  pluginNetHostSchema,
  pluginSlugSchema,
} from "./manifest.ts";
export type {
  PluginDisplayTransformRegistration,
  PluginEventSubscription,
  PluginHandlerRef,
  PluginInstance,
  PluginInvokeArgs,
  PluginMacroRegistration,
  PluginSurfaceRegistration,
  PluginToolRegistration,
  PluginTransformRegistration,
} from "./registrations.ts";
export { PLUGIN_TOOL_NAME_PREFIX, pluginToolWireName } from "./registrations.ts";
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
  PluginRenderedTree,
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
  PluginToolCardState,
} from "./ui.ts";
export {
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_BADGE_INTENTS,
  PLUGIN_BUTTON_VARIANTS,
  PLUGIN_FOOTER_MAX_DEPTH,
  PLUGIN_FOOTER_MAX_NODES,
  PLUGIN_FOOTER_NODE_KIND_ALLOWED,
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
  PLUGIN_TOOL_NAME_RE,
  PLUGIN_UI_ENTRY_MAX_BYTES,
  PLUGIN_UI_HOST_CALL_ARGS_MAX_BYTES,
  PLUGIN_UI_HOST_CALL_RESULT_MAX_BYTES,
  PLUGIN_UI_ROUTE,
  pluginSurfaceNodeSchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
} from "./ui.ts";
