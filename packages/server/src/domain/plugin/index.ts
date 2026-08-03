// domain/plugin — FRONT DOOR, the only legal external import (domain-no-cross-feature). The transport router
// calls `createPluginService`'s surface; the entry composition root assembles the `PluginContext` (wiring the
// `PluginHostPort` runtime from `infra/plugin-host` + the `PluginHostOps` op bundle — P4) and the CAS ops. The
// runtime + the host-fn bodies are wired UPWARD at compose; this domain sideways-imports nothing.
//
// ── DORMANT BY BUILD-ORDER, NOT BY DESIGN (PD-93-style citation; owner-ruled 2026-08-03) ────────────────
// This domain is REAL and it is UNREACHABLE FROM THE PRODUCT, and the two facts are not in tension:
//   • REAL — the service, the install/upgrade/enable/uninstall/list/log/runSnippet verbs, the manifest +
//     capability-grant boundary and the crash-disable policy are all built and tested, and the QuickJS
//     membrane they run on is exercised hard under AUTOMATION, which is a LIVE consumer of the same host
//     (`entry/compose/automation-plugin.ts` mints the one `PluginHostPort`; the escape/marshal/membrane/
//     realm/sandbox suites at tests/server/infra/plugin-host are the sandbox's proof).
//   • UNREACHABLE — the `plugin` tRPC router is mounted (`transport/trpc/router.ts`) and has ZERO client
//     callers: no surface anywhere in `packages/client` names `trpc.plugin.*`. There is also no ARRIVAL
//     DOOR — `install` takes raw base64 bundle bytes that no shipped affordance can produce.
// It reads exactly like the dead-wire archetype and it is NOT one: nothing was cut, the client wave simply
// has not been built. Citing it here is what keeps the wired-or-cited rule (D107) honest — an uncited
// zero-caller domain is indistinguishable from rot, and the next reader's correct instinct would be to
// delete it.
//
// THE WAVE THAT WAKES THIS: the plugin INSTALL/LIST PANE — a client surface that can produce a bundle (drop a
// .zip / pick from a source) and render `list`/`getLog`/`setEnabled` — plus the first real cargo to install.
// Until that lands nothing here changes; when it does, this citation comes out with it.

// The infra↔domain WIRE shapes (`PluginInstance` + the collected-registration records + `PluginHandlerRef`)
// live in `@orb/contracts/plugin` (the cake — infra mints them without importing a domain); re-exported here
// so the domain front door stays the one import for a plugin consumer.
export type {
  PluginEventSubscription,
  PluginHandlerRef,
  PluginInstance,
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
  PluginCrashedError,
  PluginDowngradeRefusedError,
  PluginNotFoundError,
} from "./contract/errors.ts";
export type { PluginActivationScope, PluginHostOps, PluginInvokeHandler, PluginRegistrationHandle } from "./contract/ops.ts";
export type {
  GetPluginLogParams,
  InstallPluginParams,
  ListPluginsParams,
  RunSnippetParams,
  SetPluginEnabledParams,
  UninstallPluginParams,
  UpgradePluginParams,
} from "./contract/params.ts";
export type { PluginLogView, PluginView, SnippetResult } from "./contract/results.ts";
export type { CreateInstanceInput, CreateInstanceOutcome, PluginBudgets, PluginHostPort, PluginService } from "./contract/service.ts";
export { createPluginService } from "./service.ts";
export { buildPluginPromptTransform, capFactContent } from "./substrate/registrar.ts";
export { buildPluginStorage, PLUGIN_KV_MAX_KEYS } from "./substrate/storage.ts";
