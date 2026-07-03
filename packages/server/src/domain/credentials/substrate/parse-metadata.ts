// domain/credentials/substrate/parse-metadata — the read-seam metadata helpers (the schema +
// `parseProviderMetadata` live in `@orb/contracts/credentials`; the PARSE CALL is a
// domain substrate concern). Drizzle hands `metadata` back as `unknown`; `parseProviderMetadata`
// (contracts) safe-parses it to the typed shape or `null`. This file narrows that to the custom_openai
// arm in ONE place — resolve / inspect-endpoint / fetch-models all need "the endpoint's baseUrl/headers
// or nothing", and a corrupt row (missing/non-string `baseUrl`) collapses to `null` here so an
// `undefined` URL can never escape into an outbound fetch (the bug the `.safeParse` seam closes).
//
// `CustomOpenAiEndpoint` is file-local (NOT exported) — `no-inline-types` forbids an exported type in a
// domain feature outside `contract/`; the function's inferred return surfaces the shape to callers.

import { parseProviderMetadata } from "@orb/contracts/credentials";

/** The custom_openai endpoint fields the resolver/inspector/model-fetch consume. */
interface CustomOpenAiEndpoint {
  readonly baseUrl: string;
  readonly model: string | null;
  readonly headers: Record<string, string> | null;
}

/**
 * Narrow a raw `metadata` column value to the custom_openai endpoint fields, or `null` when the row is
 * not a (valid) custom_openai endpoint. The single read-side gate: a `{kind:"custom_openai"}` row with no
 * `baseUrl` fails the contract parse → `null` here, never a fetch against `undefined`.
 */
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
