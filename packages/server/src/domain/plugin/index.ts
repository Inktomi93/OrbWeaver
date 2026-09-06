// domain/plugin — FRONT DOOR, the only legal external import (domain-no-cross-feature). The transport router
// calls `createPluginService`'s surface; the entry composition root assembles the `PluginContext` (wiring the
// `PluginHostPort` runtime from `infra/plugin-host` + the `PluginHostOps` op bundle — P4) and the CAS ops. The
// runtime + the host-fn bodies are wired UPWARD at compose; this domain sideways-imports nothing.
//
// AWAKE (truth-repaired 2026-08-24 — this header used to say DORMANT BY BUILD-ORDER / zero client callers,
// and that died when the client wave landed). The arrival door exists: `packages/client/src/features/plugin`
// is the Settings → Plugins pane (dropzone → grant screen → install) plus the chat-side snippet console, and
// it calls `trpc.plugin.*` for real (`lib/plugin-mutations.ts`).
//
// AUTHORITY, stated here because it is the one thing a reader must not re-derive from instinct: a plugin is
// USER-SCOPED (D147). Any authenticated principal installs FOR THEMSELVES; the row carries `ownerId`; every
// management verb's gate is the owner-scoped row load and NOTHING else — no `can()`, no global role, and
// deliberately no "an admin may manage any row" branch. The reason is not tidiness: enabling a plugin RUNS
// its untrusted guest bundle as the ENABLING caller (the bridge closes over `caller.userId`, the PL-C ceiling
// resolves that caller's own room role, `llm.quiet` spends that caller's credential), so a cross-owner
// management path would be a confused-deputy escalation.
//
// THE SERVER-WIDE INSTALL IS BUILT (2026-08-24 — this header used to say UNBUILT with an open design), and it
// is NOT a shared row: an admin PUBLISHES a bundle (`installForAllUsers`) and the server fans out one ordinary
// per-owner row to every user, each disabled with an empty grant and a standing consent ask. So there is still
// no shared principal and no consent junction — D147's two recorded open questions dissolved rather than got
// answered. `uninstallForAllUsers` withdraws it, skipping rows whose version the user has diverged;
// `applyDistributedPlugins` is the self-scoped new-user half. Enabling remains each owner's own act, and the
// admin verbs mint nothing that runs.

// The infra↔domain WIRE shapes (`PluginInstance` + the collected-registration records + `PluginHandlerRef`)
// live in `@orb/contracts/plugin` (the cake — infra mints them without importing a domain); re-exported here
// so the domain front door stays the one import for a plugin consumer.
export type {
  PluginDisplayTransformRegistration,
  PluginEventSubscription,
  PluginHandlerRef,
  PluginInstance,
  PluginMacroRegistration,
  PluginSurfaceRegistration,
  PluginToolRegistration,
  PluginTransformRegistration,
} from "@orb/contracts/plugin";
export { PLUGIN_CRASH_DISABLE_THRESHOLD } from "./activation/crash-policy.ts";
export type { PluginContext } from "./context.ts";
export {
  CapabilityNotGrantedError,
  HostVersionUnservedError,
  ManifestInvalidError,
  PluginAlreadyInstalledError,
  PluginBundleFetchError,
  PluginCrashedError,
  PluginDowngradeRefusedError,
  PluginNetHostsUnacknowledgedError,
  PluginNoSourceUrlError,
  PluginNotDistributedError,
  PluginNotFoundError,
  PluginNotShowcaseError,
  PluginSnippetBusyError,
} from "./contract/errors.ts";
export type {
  NotifyFloor,
  PluginActivationScope,
  PluginBelts,
  PluginEventBus,
  PluginHostOps,
  PluginIdentity,
  PluginInvokeHandler,
  PluginMacroRegistry,
  PluginRateFloor,
  PluginRegistrationHandle,
  RaisePluginSuggestion,
  SnippetGate,
  UiHostCallGate,
  VoidPluginSuggestions,
} from "./contract/ops.ts";
export type {
  ApplyDistributedPluginsParams,
  GetPluginLogParams,
  GetSurfaceStateParams,
  GetUiBundleParams,
  InstallForAllUsersParams,
  InstallPluginParams,
  InvokeUiActionParams,
  ListDisplayTransformsParams,
  ListDistributedPluginsParams,
  ListPluginsParams,
  ListSurfacesParams,
  ReportUiCrashParams,
  RunSnippetParams,
  SetPluginEnabledParams,
  SetPluginGrantParams,
  TransformForDisplayParams,
  UiHostCallParams,
  UninstallForAllUsersParams,
  UninstallPluginParams,
  UpgradePluginParams,
} from "./contract/params.ts";
export type {
  DistributedPluginApplication,
  DistributedPluginView,
  PluginCommandView,
  PluginDisplayTransformView,
  PluginFanoutResult,
  PluginFanoutSkip,
  PluginFanoutSkipReason,
  PluginLogView,
  PluginSurfaceState,
  PluginSurfaceView,
  PluginUpdateCheck,
  PluginView,
  SnippetResult,
} from "./contract/results.ts";
export { PLUGIN_FANOUT_SKIP_REASONS } from "./contract/results.ts";
export type {
  CreateInstanceInput,
  CreateInstanceOutcome,
  PluginBudgets,
  PluginDistributionDeps,
  PluginHostPort,
  PluginService,
  PluginSurfaceStateStore,
  PluginUiOutbox,
} from "./contract/service.ts";
export { recordPluginFetchedAsset } from "./persistence/plugin-assets.ts";
export { isPluginEnabledFor } from "./persistence/plugins.ts";
// The #1391 wire-name migration's plugin half: the slug census it reasons over, and the rename set it
// derives. Both are read by `entry/boot/migrate-plugin-tool-wire-names`, which hands the answer DOWN to
// chat and automation as plain data — neither of them may import this domain.
export { readInstalledPluginSlugs } from "./persistence/wire-name-census.ts";
export { createPluginService } from "./service.ts";
export { buildConfirmedActRunner } from "./substrate/confirmed-act.ts";
// The domain's own VERSION ORDERING (#803): the showcase seeder's auto-upgrade asks "does a strictly newer
// bundle ship than this row holds?", which is the same question `checkForUpdates` asks of a remote manifest.
// Exported rather than re-spelled at the entry tier — semver ordering for a plugin is this domain's call.
export { isVersionNewer } from "./substrate/manifest.ts";
export { createNotifyFloor } from "./substrate/notify-floor.ts";
export { createPluginEventBus, createPluginEventEmitter } from "./substrate/plugin-event-bus.ts";
export { createPluginMacroRegistry, PLUGIN_MACRO_RESOLVE_DEADLINE_MS, PLUGIN_MACROS_MAX, pluginMacroName } from "./substrate/plugin-macros.ts";
export { createPluginRateFloor, PLUGIN_ASSET_EGRESS_PER_HOUR, PLUGIN_EGRESS_PER_HOUR, PLUGIN_QUIET_LLM_PER_HOUR } from "./substrate/rate-floor.ts";
export { buildPluginPromptTransform, capFactContent } from "./substrate/registrar.ts";
export { createSnippetGate } from "./substrate/snippet-gate.ts";
export { buildPluginStorage, PLUGIN_KV_MAX_KEYS } from "./substrate/storage.ts";
export { createPluginSurfaceStateStore, createSurfaceStatePublisher, PLUGIN_SURFACE_STATE_MAX_KEYS } from "./substrate/surface-state.ts";
export { createUiHostCallGate, UI_HOST_CALLS_IN_FLIGHT_MAX } from "./substrate/ui-host-call-gate.ts";
export { createPluginUiOutbox, resolveUiOutcome } from "./substrate/ui-outbox.ts";
export { pluginToolWireNameRenames, pluginToolWireNameRenamesRefused } from "./substrate/wire-name-renames.ts";
export { PLUGIN_DISPLAY_TRANSFORM_DEADLINE_MS } from "./verbs/transform-for-display.ts";
