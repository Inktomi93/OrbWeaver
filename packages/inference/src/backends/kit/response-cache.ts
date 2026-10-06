import type { ResponseCache } from "@orb/contracts/inference";
import { responseCacheSchema } from "@orb/contracts/inference";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import { redactSecretsFromText } from "./openai-body.ts";

const CACHE_STATUS_HEADER = "x-openrouter-cache-status";
const CACHE_AGE_HEADER = "x-openrouter-cache-age";
const CACHE_TTL_HEADER = "x-openrouter-cache-ttl";
const CACHE_SOURCE_HEADER = "x-openrouter-cache-source-id";

function reportedSeconds(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) {
    return null;
  }
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

/** Absent or unrecognized response headers establish no cache status. */
export function responseCacheOf(headers: Readonly<Record<string, string>> | undefined, secrets: ProviderScrubSet): ResponseCache | undefined {
  const reported = new Headers(headers);
  const status = reported.get(CACHE_STATUS_HEADER)?.toLowerCase();
  if (status !== "hit" && status !== "miss") {
    return;
  }
  const sourceGenerationId = reported.get(CACHE_SOURCE_HEADER);
  const safeSource = sourceGenerationId === null ? null : redactSecretsFromText(sourceGenerationId, secrets);
  return responseCacheSchema.parse({
    status,
    ageSeconds: reportedSeconds(reported.get(CACHE_AGE_HEADER)),
    ttlSeconds: reportedSeconds(reported.get(CACHE_TTL_HEADER)),
    sourceGenerationId: safeSource === "" || safeSource !== sourceGenerationId ? null : safeSource,
  });
}
