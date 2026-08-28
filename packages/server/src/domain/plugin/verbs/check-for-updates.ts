// verb: checkForUpdates — the AUTO UPDATE-CHECK (plugin-ui-plane #679 U8 2b — the thing ST's loader does:
// check every URL-installed extension's version against its source). BATCH + SELF-scoped, the `listSurfaces`
// posture exactly: no id, it walks the caller's OWN plugins (`listOwned` filters `owner_id = caller.userId`, so
// there is no foreign row to reach) and checks only the `url`-origin ones — a file (`upload`) install has no
// remembered source, so it is simply ABSENT from the result rather than reported as a dishonest "unreachable".
//
// Each check RE-FETCHES the remote manifest through the SAME egress guard the install rode (`ctx.fetchBundle` →
// `safeFetch` ANY_HOST: https-only, per-hop private-range/IP-literal denial, redirect budget, byte cap) and
// parses it through the SAME `parseBundle` funnel — no bare fetch, no second code path. Any failure — an SSRF
// block, a non-2xx, a network error (`fetchBundleThroughGuard` → `PluginBundleFetchError`) OR a remote that
// served un-parseable bytes (`parseBundle` → `ManifestInvalidError`) — collapses to the ONE leak-free
// `unreachable` arm: distinguishing "blocked" from "404" from "garbage" would re-open the SSRF oracle the
// install funnel closed. Nothing is persisted; this verb only READS a version off the remote manifest.
//
// The checks run CONCURRENTLY (each is an independent owner-scoped fetch bounded by the guard's caps); the set
// is the caller's own url-origin plugin count, a handful in practice.

import type { CheckForUpdatesParams } from "../contract/params.ts";
import type { PluginUpdateCheck } from "../contract/results.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { listOwned } from "../persistence/plugins.ts";
import { fetchBundleThroughGuard, isVersionNewer, parseBundle } from "../substrate/manifest.ts";

export function createCheckForUpdates(ctx: PluginContext): PluginService["checkForUpdates"] {
  return async ({ caller }: CheckForUpdatesParams): Promise<readonly PluginUpdateCheck[]> => {
    const owned = await listOwned(ctx.db, caller.userId);
    // `flatMap` narrows `sourceUrl` to a non-null string for the checkable set — a file install (null) drops out
    // here, so `checkOne` never has to re-assert it and no file-origin plugin can reach the fetch.
    const checkable = owned.flatMap((row) => (row.sourceUrl === null ? [] : [{ id: row.id, sourceUrl: row.sourceUrl, version: row.version }]));
    return Promise.all(
      checkable.map(async ({ id, sourceUrl, version }): Promise<PluginUpdateCheck> => {
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
      }),
    );
  };
}
