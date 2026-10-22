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

// Canonical wire shapes live in @orb/contracts/plugin; retained aliases serve existing public consumers.

export type { PluginLogView } from "@orb/contracts/plugin";
export {
  distributedPluginViewSchema,
  pluginBundleAssetViewSchema,
  pluginCommandViewSchema,
  pluginDisplayTransformViewSchema,
  pluginFanoutResultSchema,
  pluginLogViewSchema,
  pluginSurfaceStateSchema,
  pluginSurfaceViewSchema,
  pluginViewSchema,
  snippetResultSchema,
} from "@orb/contracts/plugin";
export { PLUGIN_CRASH_DISABLE_THRESHOLD } from "./activation/crash-policy.ts";
export type { DistributedPluginApplier } from "./contract/distributed-seed.ts";
export {
  ManifestInvalidError,
  PluginCrashedError,
  PluginNotFoundError,
} from "./contract/errors.ts";
export type {
  PluginBelts,
  PluginHostOps,
  PluginMacroRegistry,
} from "./contract/ops.ts";

export {
  pluginDisplayTransformResultSchema,
  pluginGitPreviewSchema,
  pluginUiHostCallResultSchema,
  pluginUpdateCheckSchema,
  pluginUrlPreviewSchema,
} from "./contract/results.ts";
export type {
  PluginHostPort,
  PluginService,
} from "./contract/service.ts";
export type { ExamplePluginSeeder, ExamplePluginSeederDeps } from "./contract/showcase-seed.ts";
export { createPluginGrantTasksOf } from "./persistence/grant-tasks.ts";
export { recordPluginFetchedAsset } from "./persistence/plugin-assets.ts";
// `listEnabledAcrossOwners` is the BOOT reactivation step's read (#1865) — the one deliberately
// un-owner-scoped query in the persistence file, projected to (pluginId, ownerId) so its consumer can only
// ever drive each row's OWN owner's `setEnabled`. Its whole argument lives on the function's own doc.
export { isPluginEnabledFor, listEnabledAcrossOwners } from "./persistence/plugins.ts";
// The #1391 wire-name migration's plugin half: the slug census it reasons over, and the rename set it
// derives. Both are read by `entry/boot/migrate-plugin-tool-wire-names`, which hands the answer DOWN to
// chat and automation as plain data — neither of them may import this domain.
export { readInstalledPluginSlugs } from "./persistence/wire-name-census.ts";
export { createDistributedPluginApplier } from "./seeder/distributed.ts";
export { createExamplePluginSeeder } from "./seeder/showcase.ts";
export { createPluginService } from "./service.ts";
export { buildConfirmedActRunner } from "./substrate/confirmed-act.ts";
// The pack tool uses the install validator so authored bundles satisfy the same entry, size and manifest checks.
// PluginBundle stays substrate-owned; external callers consume the validated manifest.
export { parseBundle } from "./substrate/manifest.ts";
export { createNotifyFloor } from "./substrate/notify-floor.ts";
export { createPluginEventBus, createPluginEventEmitter } from "./substrate/plugin-event-bus.ts";
export { createPluginMacroRegistry, pluginMacroName } from "./substrate/plugin-macros.ts";
export {
  createPluginRateFloor,
  PLUGIN_ASSET_EGRESS_PER_HOUR,
  PLUGIN_EGRESS_PER_HOUR,
  PLUGIN_QUIET_LLM_PER_HOUR,
  PLUGIN_SEARCH_QUERY_PER_HOUR,
} from "./substrate/rate-floor.ts";

export { createShowcaseVersionReader } from "./substrate/showcase-version.ts";
export { createSnippetGate } from "./substrate/snippet-gate.ts";
export { buildPluginStorage } from "./substrate/storage.ts";
export { createPluginSurfaceStateStore, createSurfaceStatePublisher } from "./substrate/surface-state.ts";
export { createUiHostCallGate } from "./substrate/ui-host-call-gate.ts";
export { createPluginUiOutbox } from "./substrate/ui-outbox.ts";
export { pluginToolWireNameRenames, pluginToolWireNameRenamesRefused } from "./substrate/wire-name-renames.ts";
export { buildPluginQuietLlm } from "./verbs/quiet-llm.ts";
export { createPluginRegistrarOps } from "./verbs/registrar-ops.ts";
export { createPluginRuntimeOps, createPluginSuggestionExecutor } from "./verbs/runtime-ports.ts";
export { createPluginSeedOps } from "./verbs/seed-ops.ts";
