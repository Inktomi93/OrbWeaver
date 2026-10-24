// @orb/contracts/plugin — the guest↔host wire vocabulary for the D46 code sandbox. The
// membrane a guest sees (`PluginHostV1` + opaque handles + supporting projections — host-v1.ts), the
// install-time manifest + capability axis (manifest.ts), the capability→function completeness map, and
// the two guest-observable membrane errors (errors.ts). The runtime lives in `infra/plugin-host`
// (landed); the registry/lifecycle/grants lives in `domain/plugin`. This node imports nothing above
// contracts (the package cake) and is the ONE home for these shapes — the domain derives, never re-spells.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { pluginSurfaceIdSchema } from "./ui.ts";
/** The `plugin.getLog` page CEILING, enforced at the transport trust boundary (the `CHARACTER_LIST_MAX_LIMIT`
 *  precedent) — a plugin's execution log is a growing per-plugin catalog, so an over-bound ask is a
 *  BAD_REQUEST rather than an unbounded log fetch (the #45 class). */

export const PLUGIN_LOG_LIST_MAX_LIMIT = 500;

export type { InvocationChat, PluginBridge, PluginInvocationLiveness } from "./bridge.ts";
export type { PluginCommandView } from "./command-view.ts";
export { pluginCommandViewSchema } from "./command-view.ts";
export { HostVersionError, PluginCapabilityError, PluginHostDeadlineError, PluginSuggestedError } from "./errors.ts";
export type { PluginFrameCall, PluginFrameMintRequest, PluginFrameMintResponse } from "./frame.ts";
export {
  PLUGIN_FRAME_CALL_REFUSED,
  PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX,
  PLUGIN_FRAME_DOC_PREFIX,
  PLUGIN_FRAME_MINT_BODY_MAX_BYTES,
  PLUGIN_FRAME_ROUTE,
  parsePluginFrameCall,
  pluginFrameAssetUrl,
  pluginFrameMintRequestSchema,
  pluginFrameMintResponseSchema,
  pluginFrameResultMessage,
  pluginFrameUrl,
} from "./frame.ts";
export type { PluginGrantTask } from "./grant-tasks.ts";
export { pluginGrantTasks } from "./grant-tasks.ts";
export type {
  HostFunctionRef,
  PluginCharacterView,
  PluginHostV1,
  PluginLogLevel,
  PluginMessageView,
  PluginQuietOptions,
  PluginQuietSchema,
  PluginSearchHit,
  PluginWorldBookView,
  PluginWorldEntryUpsert,
  PluginWorldEntryView,
  UiProxyableHostFunction,
} from "./host-v1.ts";
export {
  HOST_FUNCTION_CAPABILITY,
  isUiProxyableHostFunction,
  PLUGIN_ASSET_READ_MAX_BYTES,
  PLUGIN_CONTINUATION_WINDOW_MS,
  PLUGIN_LOG_CHARS_MAX,
  PLUGIN_LOG_LEVELS,
  PLUGIN_LOG_LINES_MAX,
  PLUGIN_QUIET_IMAGES_MAX,
  PLUGIN_READ_CONTENT_MAX_CHARS,
  PLUGIN_SEARCH_RESULTS_MAX,
  UI_PROXYABLE_HOST_FUNCTIONS,
} from "./host-v1.ts";
export type { PluginOrigin, PluginStatus } from "./lifecycle.ts";
export { PLUGIN_ORIGINS, PLUGIN_STATUSES } from "./lifecycle.ts";
export type { PluginBuiltAgainst, PluginBundleHash, PluginCapability, PluginManifest } from "./manifest.ts";
export {
  NET_HOSTS_MAX,
  PLUGIN_BUNDLE_MAX_BYTES,
  PLUGIN_CAPABILITIES,
  PLUGIN_HOST_VERSIONS,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_MANIFEST_ENTRY,
  PLUGIN_MANIFEST_ENTRY_MAX_BYTES,
  PLUGIN_SCRIPT_ENTRY_MAX_BYTES,
  PLUGIN_UI_ASSET_ENTRY_RE,
  PLUGIN_UI_ASSET_MAX_BYTES,
  PLUGIN_UI_ASSETS_DIR,
  PLUGIN_UI_ASSETS_MAX_COUNT,
  PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES,
  PLUGIN_UI_ENTRY,
  pluginBundleHashSchema,
  pluginManifestSchema,
  pluginNetHostSchema,
  pluginSlugSchema,
} from "./manifest.ts";
export type {
  ChatAuthority,
  ExecutePluginSuggestion,
  ListPluginRecipients,
  PluginAssetReadOps,
  PluginChatReads,
  PluginDocumentReads,
  PluginNotificationDelivery,
  PluginNotificationPost,
  PluginQuickReplySurface,
  PluginWorldInfoReads,
  ReadPluginBundleBytes,
  ReadPublishedPluginBundle,
  ResolvePluginChatAuthority,
} from "./owner-reads.ts";
export type {
  PluginCommandRegistration,
  PluginDisplayTransformRegistration,
  PluginEventSubscription,
  PluginHandlerRef,
  PluginInstance,
  PluginInvokeArgs,
  PluginMacroRegistration,
  PluginPubsubSubscription,
  PluginSurfaceRegistration,
  PluginToolRegistration,
  PluginTransformRegistration,
} from "./registrations.ts";
export {
  PLUGIN_PUBSUB_NAME_RE,
  PLUGIN_PUBSUB_PAYLOAD_MAX_BYTES,
  PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX,
  PLUGIN_TOOL_NAME_PREFIX,
  pluginCardStateKey,
  pluginToolWireName,
} from "./registrations.ts";
export type { PluginBudgets, PluginInstanceCreateData } from "./runtime-input.ts";
export type { SnippetResult } from "./snippet.ts";
export { snippetResultSchema } from "./snippet.ts";
export type { PluginSuggestedAct, PluginSuggestedActKind } from "./suggestion.ts";
export { summarizePluginAct } from "./suggestion.ts";
export type {
  PluginBadgeNode,
  PluginBoundBoolean,
  PluginBoundNumber,
  PluginBoundString,
  PluginButtonNode,
  PluginCommandArgSpec,
  PluginCommandArgValue,
  PluginCommandPlacementTarget,
  PluginCommandRegistrationMeta,
  PluginConfirmButtonNode,
  PluginFrameBody,
  PluginGridNode,
  PluginGridTile,
  PluginIconName,
  PluginIconNode,
  PluginImageNode,
  PluginKeyValueNode,
  PluginKeyValueRow,
  PluginListNode,
  PluginMarkdownNode,
  PluginMasterDetailNode,
  PluginMeterNode,
  PluginNodeKind,
  PluginNumberFieldNode,
  PluginPageHero,
  PluginSearchBarNode,
  PluginSelectHostSource,
  PluginSelectNode,
  PluginSelectOption,
  PluginSliderNode,
  PluginSurfaceAnchor,
  PluginSurfaceNode,
  PluginSurfaceRegistrationMeta,
  PluginSurfaceSpec,
  PluginTabsNode,
  PluginTextFieldNode,
  PluginTextNode,
  PluginToast,
  PluginToastLevel,
  PluginToggleNode,
  PluginToolCardState,
  PluginUiOutcome,
} from "./ui.ts";
export {
  coercePluginCommandArgs,
  PLUGIN_ANCHOR_PRIMARY_ALLOWED,
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_COMMAND_ARG_NAME_RE,
  PLUGIN_COMMAND_ARGS_DECLARED_MAX,
  PLUGIN_COMMAND_ARGS_MAX,
  PLUGIN_COMMAND_NAME_RE,
  PLUGIN_COMMAND_PLACEMENT_TARGETS,
  PLUGIN_FRAME_SURFACES_MAX,
  PLUGIN_SPEC_MAX_DEPTH,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_ID_RE,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TEXT_MAX_CHARS,
  PLUGIN_TIER_REGISTRAR,
  PLUGIN_TOAST_COOLDOWN_SECONDS,
  PLUGIN_TOAST_LEVELS,
  PLUGIN_TOAST_MAX_CHARS,
  PLUGIN_TOOL_NAME_RE,
  PLUGIN_UI_HOST_CALL_ARGS_MAX_BYTES,
  PLUGIN_UI_HOST_CALL_RESULT_MAX_BYTES,
  PLUGIN_UI_OUTBOX_MAX,
  PLUGIN_UI_ROUTE,
  pluginChildNodes,
  pluginCommandArgsSchema,
  pluginCommandRegistrationMetaSchema,
  pluginComposerDraftSchema,
  pluginFrameBodySchema,
  pluginSurfaceIdSchema,
  pluginSurfaceRegistrationMetaSchema,
  pluginSurfaceSpecSchema,
  pluginUiOutcomeSchema,
  resolvePluginBoundAssetId,
  resolvePluginBoundBoolean,
  resolvePluginBoundKeyValueRows,
  resolvePluginBoundSelectOptions,
  resolvePluginBoundTabOptions,
  resolvePluginBoundTiles,
  resolvePluginPrimaryButton,
} from "./ui.ts";
export { pluginUiHostArgsSchemas } from "./ui-host.ts";
export type {
  DistributedPluginView,
  PluginBundleAssetView,
  PluginDisplayTransformView,
  PluginFanoutResult,
  PluginFanoutSkip,
  PluginLogView,
  PluginSurfaceState,
  PluginSurfaceView,
  PluginView,
} from "./view.ts";
export {
  distributedPluginViewSchema,
  pluginBundleAssetViewSchema,
  pluginDisplayTransformViewSchema,
  pluginFanoutResultSchema,
  pluginLogViewSchema,
  pluginSurfaceStateSchema,
  pluginSurfaceViewSchema,
  pluginViewSchema,
} from "./view.ts";

export const pluginIdInputSchema = z.object({ pluginId: typeIdSchema(ID_PREFIX.plugin) });

export const pluginLogInputSchema = z.object({ pluginId: typeIdSchema(ID_PREFIX.plugin), limit: z.int().positive().max(PLUGIN_LOG_LIST_MAX_LIMIT).optional() });

export const pluginSurfaceStateInputSchema = z.object({
  pluginId: typeIdSchema(ID_PREFIX.plugin),
  surfaceId: pluginSurfaceIdSchema,
  chatId: typeIdSchema(ID_PREFIX.chat).optional(),
});
