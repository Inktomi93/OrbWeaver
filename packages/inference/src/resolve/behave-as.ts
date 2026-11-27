// The ONE answer to "which provider row's facts does this connection read": its registered row, or, for a row
// whose folded `features.detectServer` is on, the built-in local-server row its server identified as. Facts
// only: the connection's identity, its `Resolved.providerId` and the credential's AAD stay the registered row's.

import type { EndpointFeatures, ProviderDef, UserConnection } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, endpointFeaturesSchema, foldFeatures, OWN_SERVER_FEATURES } from "@orb/contracts/inference";
import type { DetectedServer } from "../contract/runtime.ts";
import type { DetectCache } from "../contract/task-resolution.ts";

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
 *  takes the detected server's quirks, and the connection's own declaration still wins. A metered row never keeps an
 *  own-server feature ({@link OWN_SERVER_FEATURES}), whoever declared it; {@link ownServerFeaturesRefused} names the drop. */
export function behavedFeatures(registered: ProviderDef, behaved: ProviderDef, connection: UserConnection): EndpointFeatures {
  const folded = foldFeatures(registered.features, behaved === registered ? undefined : behaved.features, connection.declared?.features);
  if (!registered.metered) {
    return folded;
  }
  const refused: ReadonlySet<string> = new Set(OWN_SERVER_FEATURES);
  return endpointFeaturesSchema.parse(Object.fromEntries(Object.entries(folded).filter(([key]) => !refused.has(key))));
}

/** The own-server features a metered row's connection declared, which {@link behavedFeatures} dropped. */
export function ownServerFeaturesRefused(registered: ProviderDef, connection: UserConnection): readonly string[] {
  const declared = connection.declared?.features;
  return registered.metered && declared !== undefined ? OWN_SERVER_FEATURES.filter((key) => declared[key] !== undefined) : [];
}

export type { DetectCache } from "../contract/task-resolution.ts";
