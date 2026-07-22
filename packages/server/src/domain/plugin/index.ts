// domain/plugin — FRONT DOOR, the only legal external import (domain-no-cross-feature). The transport router
// calls `createPluginService`'s surface; the entry composition root assembles the `PluginContext` (wiring the
// `PluginHostPort` runtime from `infra/plugin-host` + the `PluginHostOps` op bundle — P4) and the CAS ops. The
// runtime + the host-fn bodies are wired UPWARD at compose; this domain sideways-imports nothing.

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
export { PLUGIN_CRASH_DISABLE_THRESHOLD } from "./activation/crash-policy";
export type { PluginContext } from "./context";
export {
  CapabilityNotGrantedError,
  HostVersionUnservedError,
  ManifestInvalidError,
  PluginAlreadyInstalledError,
  PluginCrashedError,
  PluginDowngradeRefusedError,
  PluginNotFoundError,
} from "./contract/errors";
export type { PluginActivationScope, PluginHostOps, PluginInvokeHandler, PluginRegistrationHandle, PluginSpendGate } from "./contract/ops";
export type {
  GetPluginBudgetParams,
  GetPluginLogParams,
  InstallPluginParams,
  ListPluginsParams,
  RunSnippetParams,
  SetPluginBudgetParams,
  SetPluginEnabledParams,
  UninstallPluginParams,
  UpgradePluginParams,
} from "./contract/params";
export type { PluginLogView, PluginView, SnippetResult } from "./contract/results";
export type { CreateInstanceInput, CreateInstanceOutcome, PluginBudgets, PluginHostPort, PluginService } from "./contract/service";
export { createPluginService } from "./service";
export { buildPluginPromptTransform, capFactContent } from "./substrate/registrar";
export { buildPluginStorage, PLUGIN_KV_MAX_KEYS } from "./substrate/storage";
