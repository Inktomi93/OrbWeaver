// verb: upgradeFromUrl — fetch a NEW bundle at a caller-supplied URL through the EGRESS GUARD, then upgrade the
// OWNED plugin through the EXISTING `upgrade` verb (U8, seam 15 — the never-silent update
// MECHANISM). #615's re-consent wall applies UNCHANGED: `upgrade` lands the row DISABLED pending re-consent
// whenever the new bundle WIDENS reach (a capability the prior grant never confirmed, OR a `netHosts` entry the
// prior manifest never declared), and carries a strict NARROWING forward silently. There is NO silent
// auto-update: this is a one-click UPGRADE act, and a widening one comes back disabled for the owner to answer.
//
// OWNER-SCOPED PRE-CHECK BEFORE ANY FETCH — the security ordering the cross-tenant sweep probes. The owned row
// is loaded first (`getById(caller.userId, pluginId)`); a foreign/missing id is a leak-free `PluginNotFoundError`
// (NOT_FOUND), thrown BEFORE `ctx.fetchBundle` ever runs. So a stranger holding another user's real pluginId can
// never make the server fetch a URL on their behalf, and the sweep gets its NOT_FOUND without the sweep URL
// needing to be reachable. `upgrade` re-loads + re-checks ownership/slug/downgrade itself (TOCTOU + defense in
// depth) — this pre-check is the fetch gate, not a replacement for the verb's own gates.
//
// The fetch rides `ctx.fetchBundle` (the compose-wired `safeFetch` ANY_HOST guard — SSRF/private-range denial +
// byte cap, NEVER a bare fetch); `fetchBundleThroughGuard` collapses any fetch failure to a leak-free
// `PluginBundleFetchError`. Nothing changes on a fetch failure or a bad-zip refusal.

import { PluginNotFoundError } from "../contract/errors.ts";
import type { UpgradeFromUrlParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";
import { fetchBundleThroughGuard } from "../substrate/manifest.ts";

export function createUpgradeFromUrl(ctx: PluginContext, deps: { readonly upgrade: PluginService["upgrade"] }): PluginService["upgradeFromUrl"] {
  return async ({ caller, pluginId, url }: UpgradeFromUrlParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    const bundle = await fetchBundleThroughGuard(ctx.fetchBundle, url);
    return deps.upgrade({ caller, pluginId, bundle });
  };
}
