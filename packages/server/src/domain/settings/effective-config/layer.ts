// domain/settings/effective-config/layer — the FLOOR-MERGE resolver. `layer(overrides)`
// resolves each field "stored override (if present) ?? the floor". Two floor ORIGINS, kept legible
// ("env is the floor" is only half-true): env-mirrored fields read `foundation/env` (the operator's boot
// floor); born-in-DB fields read a code floor only an admin override moves. Reads DOWN into `foundation/env`
// (legal — domain → foundation) + the contract's `DEFAULT_ALLOW_NON_OWNER_*` governance floors (one-home,
// derive). Pure (no I/O, no cache) — the cache + reload live in `cache.ts`.

import type {
  AppSettings,
  EffectiveAppConfig,
  RateLimits,
  ResolvedRateLimits,
  ResolvedVllmConcurrency,
  VllmConcurrency,
} from "@orb/contracts/settings";
import {
  DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
  DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
  DEFAULT_MAX_IMAGE_BYTES,
} from "@orb/contracts/settings";
import { env } from "#foundation/env";

// ── Born-in-DB floors (no env var; only an admin override moves them; named — `noMagicNumbers`) ───────
// D44 §12.3 — external media FORBIDDEN by default (the load itself is the tracking-pixel/exfil): the
// no-override default is `true` (no auto-load → click-to-load placeholder). This is an OVERRIDABLE default,
// NOT a hard clamp — an admin AppSettings override moves it, and a per-character `forbidExternalMedia`
// override resolves against it (`override ?? global`), so opting a character IN to allow (false) still works.
const FORBID_EXTERNAL_MEDIA_FLOOR = true;
// D44 §12.0 — render-trust floor is UNTRUSTED (false): rich HTML/Mermaid are NOT trusted by default; an
// admin override (or a per-character `trustHtml`) opts in. The safe default is the whole point of D21.
const TRUST_HTML_FLOOR = false;
// vLLM client-side batch concurrency — the promoted `VLLM_*_CONCURRENCY` knobs have NO env var (the env
// only carries the CHUNK size); these are the born-in-DB code floors the runners read per-batch.
const VLLM_EMBED_CONCURRENCY_FLOOR = 4;
const VLLM_SUMMARIZE_CONCURRENCY_FLOOR = 32;
// D17 per-member local-compute budget floor: `null` = unbounded (supervisor-limited). An admin override
// (a positive int) caps it.
const NON_OWNER_LOCAL_COMPUTE_BUDGET_FLOOR: number | null = null;

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Env floor KEPT here (rate limits stay boot-env; the limiter reads these), admin override layers on top.
function resolveRateLimits(o: RateLimits | null | undefined): ResolvedRateLimits {
  return {
    general: o?.general ?? env.RATE_LIMIT_GENERAL,
    aiTurn: o?.aiTurn ?? env.RATE_LIMIT_AI_TURN,
    publicIp: o?.publicIp ?? env.RATE_LIMIT_PUBLIC_IP,
    authed: o?.authed ?? env.RATE_LIMIT_AUTHED,
  };
}

// Born-in-DB code floor (no env var), admin override layers on top.
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
    allowNonOwnerLocalCompute:
      overrides.allowNonOwnerLocalCompute ?? DEFAULT_ALLOW_NON_OWNER_LOCAL_COMPUTE,
    nonOwnerLocalComputeBudget:
      overrides.nonOwnerLocalComputeBudget ?? NON_OWNER_LOCAL_COMPUTE_BUDGET_FLOOR,
    allowNonOwnerMaxProSub: overrides.allowNonOwnerMaxProSub ?? DEFAULT_ALLOW_NON_OWNER_MAX_PRO_SUB,
    maxImageBytes: overrides.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
  };
}
