// verb: checkForUpdates — the AUTO UPDATE-CHECK (U8 2b — the thing ST's loader does:
// check every URL-installed extension's version against its source). BATCH + SELF-scoped, the `listSurfaces`
// posture exactly: no id, it walks the caller's OWN plugins (`listOwned` filters `owner_id = caller.userId`, so
// there is no foreign row to reach) and checks the ones something can serve a newer version FOR — a hand
// (`upload`) install of a plugin this build does not ship has neither a remembered source nor a bundled copy,
// so it is simply ABSENT from the result rather than reported as a dishonest "unreachable".
//
// TWO SOURCES, ONE BATCH (#1740). A `url` row is re-fetched; a SEEDED SHOWCASE row (upload-origin, its slug in
// the set this build ships) is compared against the BUNDLED manifest version through the same injected reader
// the boot seeder uses (`ctx.showcase.version` → `readShowcaseManifest`), so the check and the auto-upgrade can
// never disagree about what ships. A PRISTINE seeded row needs no special case and gets none: the boot pass
// already took it to the shipped version, so it is equal by construction and reports `up-to-date`. What this
// arm exists for is the DIVERGED install the auto-upgrade deliberately passes over (the owner took the plugin
// over) — and, honestly, a pristine row whose auto-upgrade FAILED, which is the same offer either way.
//
// Each check RE-FETCHES the remote manifest through the SAME egress guard the install rode (`ctx.fetchBundle` →
// `safeFetch` ANY_HOST: https-only, per-hop private-range/IP-literal denial, redirect budget, byte cap) and
// parses it through the SAME `parseBundle` funnel — no bare fetch, no second code path. Any failure — an SSRF
// block, a non-2xx, a network error (`fetchBundleThroughGuard` → `PluginBundleFetchError`) OR a remote that
// served un-parseable bytes (`parseBundle` → `ManifestInvalidError`) — collapses to the ONE leak-free
// `unreachable` arm: distinguishing "blocked" from "404" from "garbage" would re-open the SSRF oracle the
// install funnel closed. Nothing is persisted; this verb only READS a version off the remote manifest.
//
// The checks run CONCURRENTLY (each url check is an independent owner-scoped fetch bounded by the guard's caps;
// a showcase check is a local manifest read); the set is the caller's own checkable plugin count, a handful in
// practice.

import type { PluginId } from "@orb/kit/ids";
import type { CheckForUpdatesParams } from "../contract/params.ts";
import type { PluginUpdateCheck } from "../contract/results.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { listOwned } from "../persistence/plugins.ts";
import { fetchBundleThroughGuard, isVersionNewer, parseBundle } from "../substrate/manifest.ts";

export function createCheckForUpdates(ctx: PluginContext): PluginService["checkForUpdates"] {
  /** The URL arm — re-fetch the remembered source through the egress guard and read its version. */
  async function checkUrl(id: PluginId, sourceUrl: string, version: string): Promise<PluginUpdateCheck> {
    let remoteVersion: string;
    try {
      const bytes = await fetchBundleThroughGuard(ctx.fetchBundle, sourceUrl);
      remoteVersion = parseBundle(bytes).manifest.version;
    } catch {
      // Leak-free: a fetch block, a non-2xx, or an un-parseable remote all collapse to the same arm — the
      // caller learns "couldn't determine", never what the URL resolved to (the no-SSRF-oracle posture).
      return { pluginId: id, status: "unreachable" };
    }
    return isVersionNewer(remoteVersion, version)
      ? { pluginId: id, status: "update-available", newVersion: remoteVersion }
      : { pluginId: id, status: "up-to-date" };
  }

  /** The SHOWCASE arm (#1740) — read the version off the bundle this build SHIPS. `null` means the shipped set
   *  no longer carries that slug, which is an ABSENCE (drop out of the batch) and never `unreachable`: nothing
   *  was reached for, so reporting a source failure would be a lie about a fetch that never happened. */
  async function checkShowcase(id: PluginId, slug: string, version: string): Promise<PluginUpdateCheck | null> {
    const shipped = await ctx.showcase.version(slug);
    if (shipped === null) {
      return null;
    }
    return isVersionNewer(shipped, version) ? { pluginId: id, status: "update-available", newVersion: shipped } : { pluginId: id, status: "up-to-date" };
  }

  return async ({ caller }: CheckForUpdatesParams): Promise<readonly PluginUpdateCheck[]> => {
    const owned = await listOwned(ctx.db, caller.userId);
    const checks = await Promise.all(
      // `sourceUrl` FIRST, mirroring `toPluginView`'s `updateSource`: a row's checkable source and the source the
      // client's one-click will use are ONE decision, and a row the check reports on but the button cannot serve
      // (or the reverse) is the defect this ordering forbids. A row with neither — a hand upload — is simply
      // absent from the batch, which is distinct from "unreachable".
      owned.flatMap((row) => {
        if (row.sourceUrl !== null) {
          return [checkUrl(row.id, row.sourceUrl, row.version)];
        }
        return ctx.showcase.slugs.has(row.slug) ? [checkShowcase(row.id, row.slug, row.version)] : [];
      }),
    );
    // Each checker may still resolve `null` (an unreachable url, a bundle the build no longer ships).
    return checks.filter((check): check is PluginUpdateCheck => check !== null);
  };
}
