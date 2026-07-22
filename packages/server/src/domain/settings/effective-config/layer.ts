// domain/settings/effective-config/layer — the floor-merge resolver: each field is "stored override ?? floor".
// Two floor origins: env-mirrored fields read foundation/env, born-in-DB fields read a code floor only an
// admin override moves. Pure (no I/O, no cache) — cache + reload live in cache.ts.

import type { AppSettings, EffectiveAppConfig, RateLimits, ResolvedRateLimits, ResolvedVllmConcurrency, VllmConcurrency } from "@orb/contracts/settings";
import {
  DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
  DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
  DEFAULT_DISCREET_LOGIN,
  DEFAULT_LOCAL_MULTI_USER,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@orb/contracts/settings";
import { env } from "#foundation/env";

// Born-in-DB floors (no env var; only an admin override moves them).
const FORBID_EXTERNAL_MEDIA_FLOOR = true;
const TRUST_HTML_FLOOR = false;
const VLLM_EMBED_CONCURRENCY_FLOOR = 4;
const VLLM_SUMMARIZE_CONCURRENCY_FLOOR = 32;
// null = unbounded (supervisor-limited); an admin override (positive int) caps it.
const NON_OWNER_LOCAL_COMPUTE_BUDGET_FLOOR: number | null = null;

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveRateLimits(o: RateLimits | null | undefined): ResolvedRateLimits {
  return {
    general: o?.general ?? env.RATE_LIMIT_GENERAL,
    aiTurn: o?.aiTurn ?? env.RATE_LIMIT_AI_TURN,
    publicIp: o?.publicIp ?? env.RATE_LIMIT_PUBLIC_IP,
    authed: o?.authed ?? env.RATE_LIMIT_AUTHED,
  };
}

function resolveVllmConcurrency(o: VllmConcurrency | null | undefined): ResolvedVllmConcurrency {
  return {
    embed: o?.embed ?? VLLM_EMBED_CONCURRENCY_FLOOR,
    summarize: o?.summarize ?? VLLM_SUMMARIZE_CONCURRENCY_FLOOR,
  };
}

/**
 * Resolve the stored override blob against the floor → the fully-present `EffectiveAppConfig`. Each field
 * is `override ?? floor`: `undefined` (absent) AND a stored `null` (the CLEAR sentinel) both fall through
 * to the floor — so an admin PATCH `{ field: null }` wipes the override and the floor reads back.
 */
export function layer(overrides: AppSettings): EffectiveAppConfig {
  return {
    corpusAutoindex: overrides.corpusAutoindex ?? env.CORPUS_AUTOINDEX,
    importSkipCharacters: overrides.importSkipCharacters ?? splitCsv(env.IMPORT_SKIP_CHARACTERS),
    logLevel: overrides.logLevel ?? env.LOG_LEVEL,
    forbidExternalMedia: overrides.forbidExternalMedia ?? FORBID_EXTERNAL_MEDIA_FLOOR,
    trustHtml: overrides.trustHtml ?? TRUST_HTML_FLOOR,
    memoryDefaults: overrides.memoryDefaults ?? {},
    memorySummarizer: overrides.memorySummarizer ?? {},
    rateLimits: resolveRateLimits(overrides.rateLimits),
    vllmConcurrency: resolveVllmConcurrency(overrides.vllmConcurrency),
    allowNonOwnerLocalCompute: overrides.allowNonOwnerLocalCompute ?? DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
    nonOwnerLocalComputeBudget: overrides.nonOwnerLocalComputeBudget ?? NON_OWNER_LOCAL_COMPUTE_BUDGET_FLOOR,
    allowNonOwnerMaxProSub: overrides.allowNonOwnerMaxProSub ?? DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
    maxImageBytes: overrides.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
    localMultiUser: overrides.localMultiUser ?? DEFAULT_LOCAL_MULTI_USER,
    discreetLogin: overrides.discreetLogin ?? DEFAULT_DISCREET_LOGIN,
  };
}
