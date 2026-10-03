// The persisted key family for one endpoint's facts: every snapshot about a server URL starts with its prefix, so
// a refresh that drops the prefix drops the model list, each reader's facts and the token lookups together.

import type { ModelInfoApi } from "@orb/contracts/inference";

export const ENDPOINT_CATALOG_PREFIX = "catalog:endpoint:";
const TOKENS_SEGMENT = "tokens:";
const DETECT_SEGMENT = "detect";
const TRAILING_SLASH_RE = /\/+$/u;

export function endpointCatalogPrefix(baseUrl: string): string {
  return `${ENDPOINT_CATALOG_PREFIX}${baseUrl}#`;
}

/** One mirror per (URL × reader): a native reader states facts the bare list lacks, so two rows on one URL
 *  through different readers never share a snapshot. The `#` family is new on purpose: a snapshot written under
 *  the old URL-only key carries no native facts and is never read again. */
export function endpointCatalogKey(baseUrl: string, modelInfoApi: ModelInfoApi | undefined): string {
  return `${endpointCatalogPrefix(baseUrl)}${modelInfoApi ?? "list"}`;
}

/** The per-URL detect answer sits beside the URL's reader mirrors, so a URL-wide invalidation forgets it too. */
export function endpointDetectKey(baseUrl: string): string {
  return `${endpointCatalogPrefix(baseUrl)}${DETECT_SEGMENT}`;
}

/** Every token lookup cached for one server URL; `http://h` and `http://h/` are one server. */
export function endpointTokensPrefix(baseUrl: string): string {
  return `${endpointCatalogPrefix(baseUrl.replace(TRAILING_SLASH_RE, ""))}${TOKENS_SEGMENT}`;
}

/** One model's token lookups on one server URL: a model change is a new key, so it resolves afresh. */
export function endpointTokensKey(baseUrl: string, model: string): string {
  return `${endpointTokensPrefix(baseUrl)}${model}`;
}
