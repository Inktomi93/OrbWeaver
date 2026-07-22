// Compose the domain-facing card-hub bundle: each sealed `HubAdapter` pre-bound with a `HubIo` pinned to
// its own `hosts` allowlist (doc 02 §2.2 — "the HUB_ADAPTERS bundle, each pre-bound with its HubIo"). The
// domain calls `ctx.hubs[hub].search(...)` with the `io` curried away; it never imports `infra/network`.
// Derived from the exhaustive `HUB_ADAPTERS` registry — a new hub key needs no edit here.

import type { HubKey } from "@orb/contracts/hub";
import type { HubContext } from "#domain/hub";
import type { HubAdapter, HubIo } from "#infra/network";
import { buildHubIo, HUB_ADAPTERS } from "#infra/network";
import type { HubAvatarDeps } from "../http/hub-avatar";

function bindAdapter(adapter: HubAdapter): HubContext["hubs"][HubKey] {
  const io = buildHubIo(adapter.hosts);
  return {
    capabilities: adapter.capabilities,
    search: (params) => adapter.search(params, io),
    getCard: (ref) => adapter.getCard(ref, io),
    fetchCardBytes: (ref) => adapter.fetchCardBytes(ref, io),
  };
}

/** Bind every registered adapter to its pinned `HubIo` → the `HubContext.hubs` bundle. */
export function bindHubAdapters(): HubContext["hubs"] {
  const bound = {} as Record<HubKey, HubContext["hubs"][HubKey]>;
  for (const key of Object.keys(HUB_ADAPTERS) as HubKey[]) {
    bound[key] = bindAdapter(HUB_ADAPTERS[key]);
  }
  return bound;
}

/** The H5 avatar-proxy fetcher for the transport route (doc 03 §3): each adapter's `fetchAvatar` pre-bound
 *  with its host-pinned `HubIo` (the same `hosts` allowlist + image guard). The route adds auth + the
 *  kill-switch + the LRU; the domain service is bypassed (this serves raw bytes, not a JSON verb). The op
 *  signature's ONE home is `HubAvatarDeps["fetchAvatar"]` (the route's dep interface). */
export function buildHubAvatarFetcher(): HubAvatarDeps["fetchAvatar"] {
  const ios = {} as Record<HubKey, HubIo>;
  for (const key of Object.keys(HUB_ADAPTERS) as HubKey[]) {
    ios[key] = buildHubIo(HUB_ADAPTERS[key].hosts);
  }
  return (hub, ref) => HUB_ADAPTERS[hub].fetchAvatar(ref, ios[hub]);
}
