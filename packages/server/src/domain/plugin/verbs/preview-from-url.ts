// verb: previewFromUrl — fetch a bundle at a caller-supplied URL through the EGRESS GUARD and return its
// MANIFEST for the consent screen (U8, seam 15). READ-ONLY — nothing persists, no owned
// row is touched. It is the primitive behind two things: "show the SAME consent screen a file install shows"
// (the manifest carries the declared capabilities + netHosts) AND the update-version check (the client compares
// the previewed `version` against the installed one — no server-side persistence needed).
//
// SELF-AUTHORITY: any authenticated principal. The fetch spends the server's egress, so it is authed; it reads
// no owned entity, so there is no cross-tenant surface (the sweep classifies it EXEMPT — no foreign id). The
// fetch rides `ctx.fetchBundle` (the compose-wired `safeFetch` ANY_HOST guard — SSRF/private-range denial +
// byte cap, NEVER a bare fetch); `fetchBundleThroughGuard` collapses any fetch failure to a leak-free
// `PluginBundleFetchError` (no SSRF oracle), and `parseBundle` refuses a malformed/malicious zip with a
// `ManifestInvalidError` — the SAME funnel + belts a file install rides.

import type { PreviewFromUrlParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { fetchBundleThroughGuard, parseBundle } from "../substrate/manifest.ts";

export function createPreviewFromUrl(ctx: PluginContext): PluginService["previewFromUrl"] {
  return async ({ url }: PreviewFromUrlParams) => {
    const bytes = await fetchBundleThroughGuard(ctx.fetchBundle, url);
    const { manifest } = parseBundle(bytes);
    return manifest;
  };
}
