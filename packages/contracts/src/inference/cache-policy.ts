import { z } from "zod";
import { responseCacheControlSchema, responseCacheTtlSchema } from "../preset/response-cache.ts";
import { modelIdSchema } from "./model-schema.ts";
import { PROMPT_CACHE_FORMATS, PROMPT_CACHE_RETENTIONS, PROMPT_CACHE_TTLS, promptCacheSettingsSchema } from "./prompt-cache.ts";
import { DIALECTS } from "./provider-schema.ts";
import { resolvedConnectionViewSchema } from "./resolved.ts";
import { wireSchema } from "./wires.ts";

export const PREFIX_CACHE_ACTIONS = ["none", "markers", "automatic-request"] as const;
export const CACHE_POLICY_PROVENANCES = ["fresh", "request", "preset", "connection", "default"] as const;

/** Secret-free connection input shared by execution and effective editor reads. */
export const cachePolicyContextSchema = z.strictObject({
  wire: wireSchema,
  dialect: z.enum(DIALECTS).nullable(),
  factsModel: modelIdSchema,
  promptSettings: promptCacheSettingsSchema,
  responseReplaySupported: z.boolean(),
  configuredReplay: responseCacheControlSchema,
  configuredRetention: z.strictObject({ owned: z.boolean(), value: z.enum(PROMPT_CACHE_RETENTIONS).nullable() }),
});
export type CachePolicyContext = z.infer<typeof cachePolicyContextSchema>;

/** Internal capability port: the public resolved view remains unchanged. */
export const resolvedCacheConnectionViewSchema = resolvedConnectionViewSchema.extend({ cacheContext: cachePolicyContextSchema });
export type ResolvedCacheConnectionView = z.infer<typeof resolvedCacheConnectionViewSchema>;

/** Effective controls are not cache-hit claims, token counters, or resource authority. */
export const cachePolicySchema = z.strictObject({
  prefix: z.strictObject({
    action: z.enum(PREFIX_CACHE_ACTIONS),
    format: z.enum(PROMPT_CACHE_FORMATS).nullable(),
    ttl: z.enum(PROMPT_CACHE_TTLS).nullable(),
    cacheSystem: z.boolean(),
    historyDepth: z.number().int().nonnegative().nullable(),
    preservesBlockEnds: z.boolean(),
  }),
  implicit: z.strictObject({
    supported: z.boolean().nullable(),
    disableApplied: z.boolean(),
    minimumRetentionSeconds: z.number().int().positive().nullable(),
    refreshOnHit: z.boolean().nullable(),
    retention: z.enum(PROMPT_CACHE_RETENTIONS).nullable(),
  }),
  replay: z.strictObject({
    supported: z.boolean(),
    enabled: z.boolean(),
    ttlSeconds: responseCacheTtlSchema.nullable(),
    refresh: z.boolean(),
    provenance: z.enum(CACHE_POLICY_PROVENANCES),
  }),
});
export type CachePolicy = z.infer<typeof cachePolicySchema>;
