// domain/plugin — COMPOSITION ROOT. Wires the verbs over the injected `PluginContext` + the ONE resident-
// instance registry the lifecycle shares (activate adds, deactivate/uninstall removes). ZERO logic: it builds
// the activation factories once (so every verb drives the SAME registry) and assembles the `PluginService`
// (typed return → a missing/renamed verb fails `tsc`). The context (db + injected clock/id seams + the CAS
// ops + the `PluginHostPort` runtime + the `PluginHostOps` op bundle + the belts) is built at the entry
// composition root and passed in — plugin sideways-imports nothing. Every PER-ROW management verb's authority
// is the owner-scoped row load, not a role gate (D147 clause (a)). The exception is the DISTRIBUTION trio
// (`installForAllUsers`/`uninstallForAllUsers`/`listDistributedPlugins`, D147 clause (d)), whose question is
// global — "may this caller publish to the deployment" — and whose gate therefore arrives in a SEPARATE
// `PluginDistributionDeps` parameter rather than in the context every verb shares.

import { createActivate } from "./activation/activate.ts";
import { createCrashPolicy } from "./activation/crash-policy.ts";
import { createDeactivate } from "./activation/deactivate.ts";
import type { PluginContext, PluginDistributionDeps, PluginRegistry, PluginService } from "./contract/service.ts";
import { createApplyDistributedPlugins } from "./verbs/apply-distributed-plugins.ts";
import { createCheckForUpdates } from "./verbs/check-for-updates.ts";
import { createGetFrameBody } from "./verbs/get-frame-body.ts";
import { createGetPluginLog } from "./verbs/get-plugin-log.ts";
import { createGetSurfaceState } from "./verbs/get-surface-state.ts";
import { createGetUiBundle } from "./verbs/get-ui-bundle.ts";
import { createInstall } from "./verbs/install.ts";
import { createInstallForAllUsers } from "./verbs/install-for-all-users.ts";
import { createInstallFromUrl } from "./verbs/install-from-url.ts";
import { createInvokeUiAction } from "./verbs/invoke-ui-action.ts";
import { createInvokeUiCommand } from "./verbs/invoke-ui-command.ts";
import { createListBundleAssets } from "./verbs/list-bundle-assets.ts";
import { createListCommands } from "./verbs/list-commands.ts";
import { createListDisplayTransforms } from "./verbs/list-display-transforms.ts";
import { createListDistributedPlugins } from "./verbs/list-distributed-plugins.ts";
import { createListPlugins } from "./verbs/list-plugins.ts";
import { createListSurfaces } from "./verbs/list-surfaces.ts";
import { createPreviewFromUrl } from "./verbs/preview-from-url.ts";
import { createReportUiCrash } from "./verbs/report-ui-crash.ts";
import { createRunSnippet } from "./verbs/run-snippet.ts";
import { createSetEnabled } from "./verbs/set-enabled.ts";
import { createSetGrant } from "./verbs/set-grant.ts";
import { createTransformForDisplay } from "./verbs/transform-for-display.ts";
import { createUiHostCall } from "./verbs/ui-host-call.ts";
import { createUninstall } from "./verbs/uninstall.ts";
import { createUninstallForAllUsers } from "./verbs/uninstall-for-all-users.ts";
import { createUpgrade } from "./verbs/upgrade.ts";
import { createUpgradeFromShowcase } from "./verbs/upgrade-from-showcase.ts";
import { createUpgradeFromStoredUrl } from "./verbs/upgrade-from-stored-url.ts";
import { createUpgradeFromUrl } from "./verbs/upgrade-from-url.ts";

/** `distribution` is a SEPARATE parameter, never folded into {@link PluginContext} (D147 clause (a)): the
 *  per-row verbs must keep having no privilege seam at all, and the two admin distribution verbs must have
 *  exactly one. Required rather than optional, so every composition root — production and test — is forced to
 *  state how the admin gate and the recipient list resolve there; an optional bundle would let a caller build
 *  a service whose admin verbs silently do not exist. */
export function createPluginService(ctx: PluginContext, distribution: PluginDistributionDeps): PluginService {
  // The ONE resident-instance registry (ASSUMES single-replica — the automation enabled-index precedent). Built
  // here so activate/deactivate + getLog share the same live map.
  const registry: PluginRegistry = new Map();
  const deactivate = createDeactivate(ctx, registry);
  // The crash policy drives the resident-tool invoke loop inside activation: a handler throw bumps the
  // counter (auto-disable + owner-notify at the threshold), a clean run resets it.
  const crashPolicy = createCrashPolicy(ctx, deactivate);
  const activate = createActivate(ctx, registry, crashPolicy);
  // The fan-out verbs drive the REAL per-user verbs (the `ActivationDeps` verb-to-verb precedent), so a
  // distributed copy is never a second install path: same trust edge, same consent posture, same owner-scoped
  // uninstall — only the CALLER differs, and it is always the recipient themselves.
  const install = createInstall(ctx);
  // Hoisted (was inline) so the URL-install/upgrade verbs can DELEGATE to it — the verb-to-verb precedent: a
  // URL install/upgrade is the SAME funnel + consent + owner-scoped upgrade a file one is, only the byte source
  // differs (a fetch through the egress guard). No second install path, no second consent story.
  const upgrade = createUpgrade(ctx, { activate, deactivate });
  const setGrant = createSetGrant(ctx, { activate, deactivate });
  const uninstall = createUninstall(ctx, { deactivate });
  const fanout = { ...distribution, install, setGrant };
  return {
    install,
    upgrade,
    // U8 seam 15 — the URL-install/update funnel. `previewFromUrl` fetches+parses (the consent-screen + update-
    // version primitive); `installFromUrl`/`upgradeFromUrl` fetch through the egress guard then delegate to the
    // funnel above (upgrade keeps #615's reach-widening→disabled wall). All three ride `ctx.fetchBundle`.
    previewFromUrl: createPreviewFromUrl(ctx),
    installFromUrl: createInstallFromUrl(ctx, { install }),
    upgradeFromUrl: createUpgradeFromUrl(ctx, { upgrade }),
    // U8 2b — the auto update-check + the true one-click upgrade (re-paste-free, from the STORED sourceUrl). Both
    // ride `ctx.fetchBundle`; `upgradeFromStoredUrl` delegates to the SAME `upgrade` (keeping #615's wall).
    checkForUpdates: createCheckForUpdates(ctx),
    upgradeFromStoredUrl: createUpgradeFromStoredUrl(ctx, { upgrade }),
    // …and its SEEDED-EXAMPLE twin (#1740): the same one-click, sourced from the bundle this build ships
    // (`ctx.showcase`) instead of a remembered URL, so a DIVERGED showcase install — the one the boot
    // auto-upgrade deliberately leaves alone — has a way for its owner to take a newer bundle on purpose.
    // Same `upgrade` delegate, so the consent wall is one story, not two.
    upgradeFromShowcase: createUpgradeFromShowcase(ctx, { upgrade }),
    setGrant,
    setEnabled: createSetEnabled(ctx, { activate, deactivate }),
    uninstall,
    list: createListPlugins(ctx),
    installForAllUsers: createInstallForAllUsers(ctx, fanout),
    uninstallForAllUsers: createUninstallForAllUsers(ctx, { ...distribution, uninstall }),
    listDistributedPlugins: createListDistributedPlugins(ctx, distribution),
    applyDistributedPlugins: createApplyDistributedPlugins(ctx, fanout),
    getLog: createGetPluginLog(ctx, registry),
    runSnippet: createRunSnippet(ctx),
    // The UI-surface read side (plugin-ui-plane #679 U1): listSurfaces + invokeUiAction drive the SAME resident
    // registry the lifecycle owns; getSurfaceState reads the shared surface-state plane off the context.
    listSurfaces: createListSurfaces(ctx, registry),
    getSurfaceState: createGetSurfaceState(ctx),
    // #820 seam 11 — the bundle-shipped image map the renderer resolves a node's `ui/assets/` path through.
    listBundleAssets: createListBundleAssets(ctx),
    // U7 — the frame doorway's ONE read. Same registry, same owner-scoped gate, plus a per-call re-check of the
    // row's live `ui.frame` grant (a resident instance outlives a re-grant).
    getFrameBody: createGetFrameBody(ctx, registry),
    invokeUiAction: createInvokeUiAction(ctx, registry),
    // TIER C (U4). `uiHostCall` needs NO registry — it re-gates and calls the bridge directly, so a proxied read
    // works whether or not the plugin's server guest happens to be mid-invocation. `reportUiCrash` closes over
    // the SAME `crashPolicy` the resident invoke loop drives, which is what makes a client-side death and a
    // server-side throw one counter rather than two.
    uiHostCall: createUiHostCall(ctx),
    getUiBundle: createGetUiBundle(ctx),
    reportUiCrash: createReportUiCrash(ctx, crashPolicy),
    // …and the U5 COMMAND pair (§4.5), the same two shapes over the same registry: an owner-scoped list the
    // `/plugin` dispatcher + the Plugins chrome menu both read, and a crash-policy'd round-trip that returns the
    // drained UI outcome.
    listCommands: createListCommands(ctx, registry),
    invokeUiCommand: createInvokeUiCommand(ctx, registry),
    // The DISPLAY-transform read side (U6, seam 14) — the same resident registry, the same owner-scoped read.
    listDisplayTransforms: createListDisplayTransforms(ctx, registry),
    transformForDisplay: createTransformForDisplay(ctx, registry),
  };
}
