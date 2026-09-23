// verb: installFromUrl — fetch a bundle at a caller-supplied URL through the EGRESS GUARD, then run it through
// the EXACT SAME funnel + consent/grant checks a file install takes (U8, seam 15). This is
// the INSTALL-ACT arm (an install under the user's eyes: they picked the URL and confirmed the grant), distinct
// from runtime code loading (row 23, refused) — the fetched bytes are the consent unit, validated + granted
// before anything runs.
//
// IT DELEGATES TO `install` verbatim (the verb-to-verb precedent), which is the whole safety story: the grant ⊆
// declared check, the per-owner slug-collision check, the CAS store under the caller, and the `disabled` insert
// all run unchanged. The ONE thing it adds is the honest SOURCE (U8 2b): `{ origin:"url", sourceUrl:url }`, so
// the row records where the bytes came from and the auto update-check + one-click upgrade can re-fetch it
// re-paste-free (2a recorded `"upload"` as a source-agnostic-funnel placeholder; 2b makes the origin truthful).
// SELF-authority: `install` stamps `ownerId: caller.userId`, so a URL install grants the caller authority over
// nothing but their own new row (no foreign id — the sweep classifies it EXEMPT).
//
// The fetch rides `ctx.fetchBundle` (the compose-wired `safeFetch` ANY_HOST guard — SSRF/private-range denial +
// byte cap, NEVER a bare fetch of an attacker-named URL); `fetchBundleThroughGuard` collapses any fetch failure
// to a leak-free `PluginBundleFetchError`. Nothing persists on a fetch failure OR a bad-zip refusal.

import type { InstallFromUrlParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { fetchBundleThroughGuard } from "../substrate/manifest.ts";

export function createInstallFromUrl(ctx: PluginContext, deps: { readonly install: PluginService["install"] }): PluginService["installFromUrl"] {
  return async ({ caller, url, grant }: InstallFromUrlParams) => {
    const bundle = await fetchBundleThroughGuard(ctx.fetchBundle, url);
    return deps.install({ caller, bundle, grant, source: { origin: "url", sourceUrl: url } });
  };
}
