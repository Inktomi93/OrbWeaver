// The inference funnel's own capability and cache-plan answer for one built-in route, for a CT that stubs the
// connection editor's reads. `tests/support` is the one test home allowed to reach inference internals.
import type { CachePolicyContext, GenerationCapability } from "@orb/contracts/inference";
import { effectivePromptCache, modelIdSchema } from "@orb/contracts/inference";
import { cachePolicyContextOf, responseReplaySupportedFor } from "#inference/backends/http/response-cache.ts";
import { detectModelFamily } from "#inference/capability/families.ts";
import { curatedRows } from "#inference/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "#inference/capability/synthesize.ts";
import { resolveCachePolicy } from "#inference/funnel/resolve-cache.ts";
import { makeResolved } from "../factories/resolved-connection.ts";

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
  const resolved = makeResolved({ providerId: provider.id, model: modelIdSchema.parse(model) });
  const capability = synthesizeCapability("generation", detectModelFamily(model), {
    curated: curatedRows({ model, providerId: resolved.providerId, wire: provider.wire, api: provider.apis[0] }),
  }).capability;
  if (capability.kind !== "generation") {
    throw new Error("Caching UI fixture requires a generation capability");
  }
  const connection = {
    ...resolved,
    capability,
    promptCache: effectivePromptCache(null, capability.generation.turns?.promptCacheDefaultEnabled, capability.generation.turns?.fixedCacheTtl),
    transport: replay ? { headers: { "X-OpenRouter-Cache": "true" } } : null,
  };
  const cacheContext = cachePolicyContextOf(connection, responseReplaySupportedFor(connection));
  return { capability, cacheContext, cache: resolveCachePolicy({ context: cacheContext, generation: capability.generation }) };
}
