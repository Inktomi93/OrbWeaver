// verb: upgradeFromStoredUrl — the TRUE one-click upgrade (U8 2b). Re-fetch the bundle
// from the URL the plugin was INSTALLED from (`plugins.source_url`, remembered by the `url`-origin install) and
// run it through the EXISTING `upgrade` verb — so #615's re-consent wall applies UNCHANGED: `upgrade` lands the
// row DISABLED pending re-consent whenever the new bundle WIDENS reach (a capability the prior grant never
// confirmed, OR a `netHosts` entry the prior manifest never declared), and carries a strict NARROWING forward
// silently. There is NO silent auto-update: the fetch is re-paste-free (the URL is remembered, not re-typed),
// but the ACT is still an explicit one-click upgrade, and a widening one comes back disabled for the owner to
// answer. The ONLY thing this adds over `upgradeFromUrl` is that the URL is the STORED one, not a caller echo.
//
// OWNER-SCOPED PRE-CHECK BEFORE ANY FETCH — the security ordering the cross-tenant sweep probes, identical to
// `upgradeFromUrl`. The owned row is loaded first (`getById(ctx.db, caller.userId, pluginId)`); a foreign/missing
// id is a leak-free `PluginNotFoundError` (NOT_FOUND) thrown BEFORE `ctx.fetchBundle` ever runs, so a stranger
// holding another user's real pluginId can never make the server fetch that user's remembered URL on their
// behalf. A file (`upload`) install has NO remembered source: that is a typed `PluginNoSourceUrlError`
// (BAD_REQUEST — "upload a new bundle instead"), thrown AFTER the owner load and BEFORE any fetch. `upgrade`
// re-loads + re-checks ownership/slug/downgrade itself (TOCTOU + defense in depth).

import { PluginNoSourceUrlError, PluginNotFoundError } from "../contract/errors.ts";
import type { UpgradeFromStoredUrlParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";
import { fetchBundleThroughGuard } from "../substrate/manifest.ts";

export function createUpgradeFromStoredUrl(ctx: PluginContext, deps: { readonly upgrade: PluginService["upgrade"] }): PluginService["upgradeFromStoredUrl"] {
  return async ({ caller, pluginId }: UpgradeFromStoredUrlParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    if (existing.sourceUrl === null) {
      throw new PluginNoSourceUrlError(pluginId);
    }
    const bundle = await fetchBundleThroughGuard(ctx.fetchBundle, existing.sourceUrl);
    return deps.upgrade({ caller, pluginId, bundle });
  };
}
