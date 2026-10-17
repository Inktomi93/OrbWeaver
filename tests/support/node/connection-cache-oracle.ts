// The inference funnel's own capability and cache-plan answer for one built-in route, for a CT that stubs the
// connection editor's reads, composed from the inference package's public entry.
import type { CachePolicyContext, GenerationCapability } from "@orb/contracts/inference";
import { builtinProvider, effectivePromptCache, foldFeatures, modelIdSchema } from "@orb/contracts/inference";
import { cachePolicyContextOf, curatedRows, detectModelFamily, resolveCachePolicy, responseReplaySupportedFor, synthesizeCapability } from "@orb/inference";
import { makeResolvedView } from "./factories/resolved-connection.ts";

type CuratedQuery = Parameters<typeof curatedRows>[0];

interface OracleProvider {
  readonly id: string;
  readonly wire: CuratedQuery["wire"];
  readonly apis: readonly NonNullable<CuratedQuery["api"]>[];
}

interface CacheOracle {
  readonly capability: ReturnType<typeof synthesizeCapability>["capability"] & { readonly kind: "generation"; readonly generation: GenerationCapability };
  readonly cacheContext: CachePolicyContext;
  readonly cache: ReturnType<typeof resolveCachePolicy>;
}

/** The curated generation capability for `model` on `provider`, and the cache plan the funnel resolves from it.
 *  `replay` turns on the OpenRouter response-replay transport header. */
export function connectionCacheOracle(provider: OracleProvider, model: string, replay: boolean): CacheOracle {
  const row = builtinProvider(provider.id);
  if (row === undefined) {
    throw new Error(`Caching UI fixture requires a built-in provider: ${provider.id}`);
  }
  const resolved = makeResolvedView({ providerId: row.id, wire: row.wire, api: row.apis[0] ?? null, model: modelIdSchema.parse(model) });
  const capability = synthesizeCapability("generation", detectModelFamily(model), {
    curated: curatedRows({ model, providerId: resolved.providerId, wire: provider.wire, api: provider.apis[0] }),
  }).capability;
  if (capability.kind !== "generation") {
    throw new Error("Caching UI fixture requires a generation capability");
  }
  const connection = {
    ...resolved,
    provider: row,
    features: foldFeatures(row.features, undefined),
    factsModel: resolved.model,
    extras: null,
    capability,
    promptCache: effectivePromptCache(null, capability.generation.turns?.promptCacheDefaultEnabled, capability.generation.turns?.fixedCacheTtl),
    transport: replay ? { headers: { "X-OpenRouter-Cache": "true" } } : null,
  };
  const cacheContext = cachePolicyContextOf(connection, responseReplaySupportedFor(connection));
  return { capability, cacheContext, cache: resolveCachePolicy({ context: cacheContext, generation: capability.generation }) };
}
