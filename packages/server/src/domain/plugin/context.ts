// domain/plugin — DI bundle. The `PluginContext` type is homed in `contract/service.ts`; this builder owner-scopes
// the db and replaces the injected `fetchBundle` with its guarded form, so no verb can reach the raw fetch.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import { isRecordedEgressBlock } from "#infra/network";
import { PluginBundleFetchError } from "./contract/errors.ts";
import type { PluginContext } from "./contract/service.ts";

export function createPluginContext(input: DbAssemblyInput<PluginContext>): PluginContext {
  return { ...input, db: databaseForOwner(input.db), fetchBundle: fetchBundleThroughGuard(input.fetchBundle, input.logger) };
}

// The URL-install funnel's fetch half (U8, seam 15): the injected egress-guarded fetch (`ctx.fetchBundle` →
// `infra/network`'s `fetchPluginBundle` — `safeFetch` ANY_HOST: https-only, per-hop private-range/IP-literal
// denial, redirect budget, byte cap), whose bytes the verbs hand to `parseBundle`. The wrapper is a SECURITY
// choke: it collapses EVERY fetch failure — an SSRF block, a scheme/redirect refusal, a non-2xx, a network
// error — to ONE leak-free `PluginBundleFetchError`. The original `cause` stays server-side: `safeFetch`'s own
// error carries the block REASON (`"private-address"` vs `"host-not-allowed"`), and a serialized cause would
// re-leak exactly the SSRF oracle the collapse exists to close, so it rides the error as `cause` (which the
// transport never serializes) and is logged here. The domain never branches on the block reason (the
// `fetchWebDocument`→`ScrapeFailedError` precedent) — infra performs the guarded fetch and throws; this catches,
// and only asks whether the block is already on record.
function fetchBundleThroughGuard(fetchBundle: PluginContext["fetchBundle"], log: Logger): PluginContext["fetchBundle"] {
  return async (url) => {
    try {
      return await fetchBundle(url);
    } catch (cause) {
      // A modeled refusal is not logged by the transport, so a failed fetch is recorded here, unless the firewall
      // already wrote its security event for the block.
      if (!isRecordedEgressBlock(cause)) {
        getLog(log).warn({ err: cause }, "plugin: a bundle fetch failed");
      }
      throw new PluginBundleFetchError(url, { cause });
    }
  };
}
