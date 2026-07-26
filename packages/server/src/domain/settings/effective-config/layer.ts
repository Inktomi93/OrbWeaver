// domain/settings/effective-config/layer — the floor-merge resolver: each field is "stored override ?? floor".
// Two floor origins: env-mirrored fields read foundation/env, born-in-DB fields read a code floor only an
// admin override moves. Pure (no I/O, no cache) — cache + reload live in cache.ts.

import type {
  AppSettings,
  EffectiveAppConfig,
  EngineLaunch,
  RateLimits,
  ResolvedEngineLaunch,
  ResolvedRateLimits,
  ResolvedVllmConcurrency,
  VllmConcurrency,
} from "@orb/contracts/settings";
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
    aiTurn: o?.aiTurn ?? env.RATE_LIMIT_AI_TURN,
    publicIp: o?.publicIp ?? env.RATE_LIMIT_PUBLIC_IP,
    authed: o?.authed ?? env.RATE_LIMIT_AUTHED,
    login: o?.login ?? env.RATE_LIMIT_LOGIN,
  };
}

function resolveVllmConcurrency(o: VllmConcurrency | null | undefined): ResolvedVllmConcurrency {
  return {
    embed: o?.embed ?? VLLM_EMBED_CONCURRENCY_FLOOR,
    summarize: o?.summarize ?? VLLM_SUMMARIZE_CONCURRENCY_FLOOR,
  };
}

// The engine LAUNCH config: admin override ?? the env floor, per field (#14). Same `override ?? floor` shape
// as the rest of the layer; the env vars are the single-home floor (foundation/env). Ports are NOT here —
// they are env-only DEPLOYMENT facts the spawner reads directly.
function resolveEngineLaunch(o: EngineLaunch | null | undefined): ResolvedEngineLaunch {
  return {
    embedModel: o?.embedModel ?? env.VLLM_EMBED_MODEL,
    rerankModel: o?.rerankModel ?? env.VLLM_RERANK_MODEL,
    genModel: o?.genModel ?? env.VLLM_GEN_MODEL,
    embedMaxModelLen: o?.embedMaxModelLen ?? env.VLLM_EMBED_MAX_MODEL_LEN,
    rerankMaxModelLen: o?.rerankMaxModelLen ?? env.VLLM_RERANK_MAX_MODEL_LEN,
    genMaxModelLen: o?.genMaxModelLen ?? env.VLLM_GEN_MAX_MODEL_LEN,
    embedGpuUtil: o?.embedGpuUtil ?? env.VLLM_EMBED_GPU_UTIL,
    rerankGpuUtilMulti: o?.rerankGpuUtilMulti ?? env.VLLM_RERANK_GPU_UTIL_MULTI,
    rerankGpuUtilSingle: o?.rerankGpuUtilSingle ?? env.VLLM_RERANK_GPU_UTIL_SINGLE,
    genGpuUtilMulti: o?.genGpuUtilMulti ?? env.VLLM_GEN_GPU_UTIL_MULTI,
    genGpuUtilSingle: o?.genGpuUtilSingle ?? env.VLLM_GEN_GPU_UTIL_SINGLE,
    poolingMaxPixels: o?.poolingMaxPixels ?? env.VLLM_POOLING_MAX_PIXELS,
    genMaxPixels: o?.genMaxPixels ?? env.VLLM_GEN_MAX_PIXELS,
    genRepetitionPenalty: o?.genRepetitionPenalty ?? env.VLLM_GEN_REPETITION_PENALTY,
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
    engineLaunch: resolveEngineLaunch(overrides.engineLaunch),
    allowNonOwnerLocalCompute: overrides.allowNonOwnerLocalCompute ?? DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
    nonOwnerLocalComputeBudget: overrides.nonOwnerLocalComputeBudget ?? NON_OWNER_LOCAL_COMPUTE_BUDGET_FLOOR,
    allowNonOwnerMaxProSub: overrides.allowNonOwnerMaxProSub ?? DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
    maxImageBytes: overrides.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
    localMultiUser: overrides.localMultiUser ?? DEFAULT_LOCAL_MULTI_USER,
    discreetLogin: overrides.discreetLogin ?? DEFAULT_DISCREET_LOGIN,
  };
}
