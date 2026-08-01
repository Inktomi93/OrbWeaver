// domain/credentials/substrate/parse-metadata — narrows the drizzle-unknown metadata column to the
// custom_openai endpoint shape in one place, so a corrupt row collapses to null rather than letting an
// undefined URL escape into an outbound fetch.

import type { CustomOpenAiResponseMap } from "@orb/contracts/credentials";
import { parseProviderMetadata } from "@orb/contracts/credentials";

/** The custom_openai endpoint fields the resolver/inspector/model-fetch consume. */
interface CustomOpenAiEndpoint {
  readonly baseUrl: string;
  readonly model: string | null;
  readonly headers: Record<string, string> | null;
  readonly contextWindow: number | undefined;
  readonly includeBody: Record<string, unknown> | null;
  readonly excludeBody: readonly string[] | null;
  readonly responseMap: CustomOpenAiResponseMap | null;
}

/** Narrow a raw metadata column value to the custom_openai endpoint fields, or null. */
export function parseCustomOpenAiEndpoint(raw: unknown): CustomOpenAiEndpoint | null {
  const meta = parseProviderMetadata(raw);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: `ProviderMetadata` is `custom_openai | null` (the z.null() arm — tsc confirms it); biome's cross-package zod-union inference misses the null member and calls the guard redundant, but tsc rejects the `meta.baseUrl` access below without it and a null metadata row would NPE — biome is the false positive.
  if (meta === null) {
    return null;
  }
  return {
    baseUrl: meta.baseUrl,
    model: meta.model ?? null,
    headers: meta.headers ?? null,
    contextWindow: meta.contextWindow,
    includeBody: meta.includeBody ?? null,
    excludeBody: meta.excludeBody ?? null,
    responseMap: meta.responseMap ?? null,
  };
}
