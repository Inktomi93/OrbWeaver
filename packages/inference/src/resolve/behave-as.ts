// The ONE answer to "which provider row's facts does this connection read": its registered row, or, for a row
// whose folded `features.detectServer` is on, the built-in local-server row its server identified as. Facts
// only: the connection's identity, its `Resolved.providerId` and the credential's AAD stay the registered row's.

import type { EndpointFeatures, ProviderDef, UserConnection } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, foldFeatures } from "@orb/contracts/inference";
import type { Mirror } from "../catalog/mirror.ts";
import type { DetectedServer } from "../contract/runtime.ts";

/** The slice of the resolver context detection reads: the per-URL detect cache. */
export interface DetectCache {
  readonly detectedServer: (baseUrl: string) => Mirror<DetectedServer>;
}

/** The built-in endpoint row a detected server names. */
function detectedRow(server: NonNullable<DetectedServer["server"]>): ProviderDef | undefined {
  return BUILTIN_PROVIDERS.find((row) => row.auth === "endpoint" && row.id === server);
}

/** The URL a detecting row probes, or `null` when the row does not detect: the knob is off, the connection
 *  declares its own reader (declared beats detected), or there is no server URL on the openai-compat wire. */
export function detectionUrl(provider: ProviderDef, connection: UserConnection): string | null {
  const declared = connection.declared?.features;
  if (provider.wire !== "openai-compat" || foldFeatures(provider.features, declared).detectServer !== true || declared?.modelInfoApi !== undefined) {
    return null;
  }
  return provider.baseUrl ?? connection.baseUrl;
}

/** The row whose features and model-info API this connection reads. A cold detect cache reads the registered
 *  row; the resolver warms the cache before its first provider-dependent step. */
export function behaveAs(ctx: DetectCache, provider: ProviderDef, connection: UserConnection): ProviderDef {
  const baseUrl = detectionUrl(provider, connection);
  const detected = baseUrl === null ? null : ctx.detectedServer(baseUrl).get()?.server;
  return (detected === null || detected === undefined ? undefined : detectedRow(detected)) ?? provider;
}

/** `wire default ← registered row ← detected row ← connection.declared`: a detecting row keeps its own knob,
 *  takes the detected server's quirks, and the connection's own declaration still wins. */
export function behavedFeatures(registered: ProviderDef, behaved: ProviderDef, connection: UserConnection): EndpointFeatures {
  return foldFeatures(registered.features, behaved === registered ? undefined : behaved.features, connection.declared?.features);
}
