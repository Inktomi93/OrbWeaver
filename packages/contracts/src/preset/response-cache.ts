// Complete response replay is distinct from provider prompt-prefix caching.
import { z } from "zod";

export const RESPONSE_CACHE_TTL_BOUNDS = { min: 1, max: 86_400, default: 300 } as const;
export const responseCacheTtlSchema = z.number().int().min(RESPONSE_CACHE_TTL_BOUNDS.min).max(RESPONSE_CACHE_TTL_BOUNDS.max);

export const responseCacheSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  ttlSeconds: responseCacheTtlSchema.optional(),
});
export type ResponseCacheSettings = z.infer<typeof responseCacheSettingsSchema>;

export const responseCacheControlSchema = responseCacheSettingsSchema.partial().extend({
  refresh: z.boolean().optional(),
});
export type ResponseCacheControl = z.infer<typeof responseCacheControlSchema>;
