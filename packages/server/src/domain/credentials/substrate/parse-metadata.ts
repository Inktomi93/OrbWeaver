// domain/credentials/substrate/parse-metadata — narrows the drizzle-unknown metadata column to the
// custom_openai endpoint shape in one place, so a corrupt row collapses to null rather than letting an
// undefined URL escape into an outbound fetch.

import { parseProviderMetadata } from "@orb/contracts/credentials";

/** The custom_openai endpoint fields the resolver/inspector/model-fetch consume. */
interface CustomOpenAiEndpoint {
  readonly baseUrl: string;
  readonly model: string | null;
  readonly headers: Record<string, string> | null;
}

/** Narrow a raw metadata column value to the custom_openai endpoint fields, or null. */
export function parseCustomOpenAiEndpoint(raw: unknown): CustomOpenAiEndpoint | null {
  const meta = parseProviderMetadata(raw);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: parseProviderMetadata returns `… | null` (the z.null() arm — tsc confirms it); biome's cross-package zod-union inference misses the null member and calls the guard redundant, but tsc rejects `meta.kind` without it and a null metadata row would NPE — biome is the false positive.
  if (meta === null || meta.kind !== "custom_openai") {
    return null;
  }
  return {
    baseUrl: meta.baseUrl,
    model: meta.model ?? null,
    headers: meta.headers ?? null,
  };
}
