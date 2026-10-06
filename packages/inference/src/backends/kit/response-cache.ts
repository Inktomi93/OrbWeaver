// Request controls override configured cache headers without changing unrelated headers.

import type { CachePolicy, CachePolicyContext, Dialect, ResponseCache, Task } from "@orb/contracts/inference";
import { PROMPT_CACHE_RETENTIONS, responseCacheSchema } from "@orb/contracts/inference";
import type { ResponseCacheControl } from "@orb/contracts/preset";
import { RESPONSE_CACHE_TTL_BOUNDS } from "@orb/contracts/preset";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import type { Resolved } from "../../contract/resolved.ts";
import { redactSecretsFromText } from "./openai-body.ts";

const CACHE_ENABLED_HEADER = "x-openrouter-cache";
const CACHE_TTL_HEADER = "x-openrouter-cache-ttl";
const CACHE_REFRESH_HEADER = "x-openrouter-cache-clear";
const CACHE_STATUS_HEADER = "x-openrouter-cache-status";
const CACHE_AGE_HEADER = "x-openrouter-cache-age";
const CACHE_SOURCE_HEADER = "x-openrouter-cache-source-id";
const PROMPT_RETENTION_KEY = "prompt_cache_retention";

function configuredRetention(connection: Pick<Resolved, "transport" | "extras" | "wire" | "provider">): CachePolicyContext["configuredRetention"] {
  const transport = connection.transport;
  if (transport?.excludeBody?.includes(PROMPT_RETENTION_KEY) === true) {
    return { owned: true, value: null };
  }
  const included = transport?.includeBody;
  const extras = connection.wire === "openai-compat" && effectiveDialectOf(connection) !== "openrouter" ? connection.extras : null;
  const body = included !== undefined && Object.hasOwn(included, PROMPT_RETENTION_KEY) ? included : extras;
  const owned = body !== null && Object.hasOwn(body, PROMPT_RETENTION_KEY);
  return { owned, value: PROMPT_CACHE_RETENTIONS.find((value) => value === body?.[PROMPT_RETENTION_KEY]) ?? null };
}

/** Normalize configured HTTP controls without exposing arbitrary headers in the policy context. */
function configuredResponseCache(headers: Readonly<Record<string, string>> | undefined): ResponseCacheControl {
  const configured = new Headers(headers);
  const enabled = configured.get(CACHE_ENABLED_HEADER);
  const ttl = configured.get(CACHE_TTL_HEADER);
  const refresh = configured.get(CACHE_REFRESH_HEADER);
  const ttlSeconds = configuredTtl(ttl);
  return {
    ...(enabled === null ? {} : { enabled: enabled.toLowerCase() === "true" }),
    ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
    ...(refresh === null ? {} : { refresh: refresh.toLowerCase() === "true" }),
  };
}

function configuredTtl(value: string | null): number | undefined {
  if (value === null || !/^\d/u.test(value)) {
    return;
  }
  return Math.min(RESPONSE_CACHE_TTL_BOUNDS.max, Math.max(RESPONSE_CACHE_TTL_BOUNDS.min, Number.parseInt(value, 10)));
}

/** The compatible transport's effective dialect, shared by factory, execution and readback projection. */
export function effectiveDialectOf(connection: Pick<Resolved, "provider">): Dialect {
  return connection.provider.dialect ?? "openai-compatible";
}

/** Only implemented OpenRouter endpoints documented by the response-cache contract are eligible. */
export function responseReplaySupportedFor(connection: Pick<Resolved, "wire" | "provider" | "features" | "task">): boolean {
  if (connection.wire !== "openai-compat" || effectiveDialectOf(connection) !== "openrouter") {
    return false;
  }
  const tasks: Readonly<Record<Task, boolean>> = {
    chat: true,
    agent: false,
    summarize: true,
    structured: true,
    generateImage: connection.features.images !== "images-api",
    embed: true,
    imageEmbed: true,
    rerank: false,
  };
  return tasks[connection.task];
}

/** Project only secret-free cache inputs from a resolved connection. */
export function cachePolicyContextOf(
  connection: Pick<Resolved, "promptCache" | "transport" | "wire" | "provider" | "factsModel" | "extras">,
  responseReplaySupported: boolean,
): CachePolicyContext {
  return {
    wire: connection.wire,
    dialect: connection.wire === "openai-compat" ? effectiveDialectOf(connection) : null,
    factsModel: connection.factsModel,
    promptSettings: connection.promptCache,
    responseReplaySupported,
    configuredReplay: configuredResponseCache(connection.transport?.headers),
    configuredRetention: configuredRetention(connection),
  };
}

/** Spell the resolved replay plan while preserving unrelated configured headers. */
export function responseCacheHeaders(args: {
  readonly configured?: Readonly<Record<string, string>> | undefined;
  readonly plan: CachePolicy;
}): Record<string, string> {
  const headers = new Headers(args.configured);
  headers.set(CACHE_ENABLED_HEADER, String(args.plan.replay.enabled));
  const ttl = args.plan.replay.ttlSeconds;
  if (ttl !== null) {
    headers.set(CACHE_TTL_HEADER, String(ttl));
  }
  if (args.plan.replay.refresh) {
    headers.set(CACHE_REFRESH_HEADER, "true");
  } else {
    headers.delete(CACHE_REFRESH_HEADER);
  }
  return Object.fromEntries(headers);
}

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
