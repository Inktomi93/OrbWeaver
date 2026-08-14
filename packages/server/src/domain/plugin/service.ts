// domain/plugin — COMPOSITION ROOT. Wires the verbs over the injected `PluginContext` + the ONE resident-
// instance registry the lifecycle shares (activate adds, deactivate/uninstall removes). ZERO logic: it builds
// the activation factories once (so every verb drives the SAME registry) and assembles the `PluginService`
// (typed return → a missing/renamed verb fails `tsc`). The context (db + injected clock/id/can seams + the CAS
// ops + the `PluginHostPort` runtime + the `PluginHostOps` op bundle) is built at the entry composition root
// and passed in — plugin sideways-imports nothing.

import { createActivate } from "./activation/activate.ts";
import { createCrashPolicy } from "./activation/crash-policy.ts";
import { createDeactivate } from "./activation/deactivate.ts";
import type { PluginContext, PluginRegistry, PluginService } from "./contract/service.ts";
import { createGetPluginLog } from "./verbs/get-plugin-log.ts";
import { createInstall } from "./verbs/install.ts";
import { createListPlugins } from "./verbs/list-plugins.ts";
import { createRunSnippet } from "./verbs/run-snippet.ts";
import { createSetEnabled } from "./verbs/set-enabled.ts";
import { createUninstall } from "./verbs/uninstall.ts";
import { createUpgrade } from "./verbs/upgrade.ts";

export function createPluginService(ctx: PluginContext): PluginService {
  // The ONE resident-instance registry (ASSUMES single-replica — the automation enabled-index precedent). Built
  // here so activate/deactivate + getLog share the same live map.
  const registry: PluginRegistry = new Map();
  const deactivate = createDeactivate(ctx, registry);
  // The crash policy drives the resident-tool invoke loop inside activation: a handler throw bumps the
  // counter (auto-disable + owner-notify at the threshold), a clean run resets it.
  const crashPolicy = createCrashPolicy(ctx, deactivate);
  const activate = createActivate(ctx, registry, crashPolicy);
  return {
    install: createInstall(ctx),
    upgrade: createUpgrade(ctx, { activate, deactivate }),
    setEnabled: createSetEnabled(ctx, { activate, deactivate }),
    uninstall: createUninstall(ctx, { deactivate }),
    list: createListPlugins(ctx),
    getLog: createGetPluginLog(ctx, registry),
    runSnippet: createRunSnippet(ctx),
  };
}
