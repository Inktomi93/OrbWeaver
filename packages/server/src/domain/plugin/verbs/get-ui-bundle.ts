// verb: getUiBundle — the SOURCE of one owned plugin's Tier-C client guest (U4, §4.6 /
// seam 8). The browser worker needs the `ui.js` text to `evalCode` into its interpreter; this is where those
// bytes come from, and it is the only place they can.
//
// IT RE-READS AND RE-PARSES THE STORED BUNDLE rather than caching the source anywhere. That is the same posture
// activation takes ("the stored bundle is the whole zip, re-parsed + re-validated on load",
// `substrate/manifest.ts`), and it is what keeps ONE trust edge: a caller cannot receive `ui.js` bytes that did
// not just pass the unzip hardening, the entry allow-list, the size caps and the manifest biconditional. A
// cached copy would be a second source of guest code with no funnel in front of it.
//
// THREE GATES, and the third is the one that matters most for a bytes surface:
//  1. OWNER SCOPE — `getById(db, caller.userId, pluginId)`; a foreign id is a leak-free NOT_FOUND, so plugin
//     source is never readable across tenants (a bundle is a user's own uploaded file, and some are private).
//  2. CAS OWNER SCOPE — `ctx.assets.readBytes(caller, assetId)` is itself owner-gated, so even a corrupted row
//     pointing at someone else's asset cannot serve their bytes. Two independent scopes, not one.
//  3. DECLARATION — `null` when this plugin ships no `ui.js`. Absent is a normal answer (every Tier-S plugin),
//     never an error, so the route can answer 404 without the caller learning anything they did not already
//     know from `listSurfaces` (which already tells them the plugin has no scripted surface).
//
// The `enabled` status is deliberately NOT a gate here, and the reasoning is worth stating because the sibling
// verb `uiHostCall` DOES gate on it. Status governs whether a plugin may ACT; this verb returns inert text that
// the client can only run inside its own sandbox, under its own budgets, calling nothing (`uiHostCall` re-gates
// every host reach independently and does check status). Gating source on `enabled` would buy no containment
// and would break the one legitimate read of a disabled plugin's UI: a person looking at why it is broken.

import { PluginNotFoundError } from "../contract/errors.ts";
import type { GetUiBundleParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";
import { parseBundle } from "../substrate/manifest.ts";

export function createGetUiBundle(ctx: PluginContext): PluginService["getUiBundle"] {
  return async ({ caller, pluginId }: GetUiBundleParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    // Cheap pre-check off the PERSISTED manifest: a plugin that declares no `uiEntry` cannot have `ui.js` in its
    // zip (the funnel's biconditional refuses that bundle at install), so there is nothing to unzip. This is an
    // optimisation, not the gate — `parseBundle` below is still the authority, and it would answer the same.
    if (existing.manifest.uiEntry === undefined) {
      return null;
    }
    const { bytes } = await ctx.assets.readBytes(caller, existing.bundleAssetId);
    return parseBundle(bytes).uiJs ?? null;
  };
}
